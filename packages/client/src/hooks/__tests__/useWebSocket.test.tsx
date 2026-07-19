import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebSocket } from "../useWebSocket.js";

const authMocks = vi.hoisted(() => ({
  getDeviceBearer: vi.fn<() => string | null>(),
  mintWsTicket: vi.fn<(client: "browser" | "electron") => Promise<string | null>>(),
  appendWsTicket: vi.fn((url: string, ticket: string) => `${url}?ticket=${ticket}`),
}));

vi.mock("../../lib/device-auth.js", () => authMocks);
vi.mock("@blackbelt-technology/dashboard-plugin-runtime", () => ({ setSender: vi.fn() }));

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  closeCalls = 0;
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closeCalls++;
    this.readyState = FakeWebSocket.CLOSED;
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  triggerMessage(message: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(message) }));
  }

  triggerClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  static reset() {
    FakeWebSocket.instances = [];
  }
}

describe("useWebSocket connection authority", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    FakeWebSocket.reset();
    authMocks.getDeviceBearer.mockReturnValue(null);
    authMocks.mintWsTicket.mockResolvedValue(null);
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: FakeWebSocket,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    });
  });

  it("does not let a late ticket from an old URL open or replace the current socket", async () => {
    authMocks.getDeviceBearer.mockReturnValue("paired-device");
    const oldTicket = deferred<string | null>();
    const newTicket = deferred<string | null>();
    authMocks.mintWsTicket.mockReturnValueOnce(oldTicket.promise).mockReturnValueOnce(newTicket.promise);

    const { rerender } = renderHook(({ url }) => useWebSocket(url), {
      initialProps: { url: "ws://old.example/ws" },
    });
    expect(FakeWebSocket.instances).toHaveLength(0);

    rerender({ url: "ws://new.example/ws" });
    await act(async () => {
      newTicket.resolve("new-ticket");
      await newTicket.promise;
    });
    expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual([
      "ws://new.example/ws?ticket=new-ticket",
    ]);

    await act(async () => {
      oldTicket.resolve("old-ticket");
      await oldTicket.promise;
    });
    expect(FakeWebSocket.instances.map((socket) => socket.url)).toEqual([
      "ws://new.example/ws?ticket=new-ticket",
    ]);
  });

  it("ignores captured open, message, error, and close callbacks from an old URL", () => {
    const { result, rerender } = renderHook(({ url }) => useWebSocket(url), {
      initialProps: { url: "ws://old.example/ws" },
    });
    const oldSocket = FakeWebSocket.instances[0];
    const staleOpen = oldSocket.onopen;
    const staleMessage = oldSocket.onmessage;
    const staleError = oldSocket.onerror;
    const staleClose = oldSocket.onclose;
    const handler = vi.fn();
    result.current.onMessage(handler);

    rerender({ url: "ws://new.example/ws" });
    const newSocket = FakeWebSocket.instances[1];
    expect(oldSocket.closeCalls).toBe(1);
    expect(result.current.status).toBe("connecting");

    act(() => {
      staleOpen?.(new Event("open"));
      staleMessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "sessions_snapshot",
            serverEpoch: "stale-server",
            sessions: [],
            orders: {},
          }),
        }),
      );
      staleError?.(new Event("error"));
      staleClose?.(new CloseEvent("close"));
      vi.advanceTimersByTime(60_000);
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.current.status).toBe("connecting");
    expect(result.current.serverEpoch).toBeNull();
    expect(FakeWebSocket.instances).toHaveLength(2);

    act(() => {
      newSocket.triggerOpen();
      newSocket.triggerMessage({
        type: "sessions_snapshot",
        serverEpoch: "current-server",
        sessions: [],
        orders: {},
      });
    });
    expect(result.current.status).toBe("connected");
    expect(result.current.serverEpoch).toBe("current-server");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("invalidates and closes the captured socket during cleanup", () => {
    const { unmount } = renderHook(() => useWebSocket("ws://example.test/ws"));
    const socket = FakeWebSocket.instances[0];
    const staleClose = socket.onclose;

    unmount();
    expect(socket.closeCalls).toBe(1);

    act(() => {
      staleClose?.(new CloseEvent("close"));
      vi.advanceTimersByTime(60_000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("coalesces foreground reconnect requests until the replacement socket opens", () => {
    const { result } = renderHook(() => useWebSocket("ws://example.test/ws"));
    const initialSocket = FakeWebSocket.instances[0];
    act(() => initialSocket.triggerOpen());
    const initialEpoch = result.current.connectionEpoch;

    act(() => {
      result.current.reconnectNow("foreground");
      result.current.reconnectNow("foreground");
      result.current.reconnectNow("foreground");
    });

    expect(initialSocket.closeCalls).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(result.current.connectionEpoch).toBe(initialEpoch + 1);

    const replacement = FakeWebSocket.instances[1];
    act(() => replacement.triggerOpen());
    act(() => result.current.reconnectNow("foreground"));

    expect(replacement.closeCalls).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(result.current.connectionEpoch).toBe(initialEpoch + 2);
  });

  it("preserves reconnect-on-close for the current socket", () => {
    const { result } = renderHook(() => useWebSocket("ws://example.test/ws"));
    const socket = FakeWebSocket.instances[0];

    act(() => socket.triggerClose());
    expect(result.current.status).toBe("connecting");
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1_000));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
