import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { packageQueue } from "../package-queue.js";

// Helpers ---------------------------------------------------------------

function dispatchComplete(opId: string, success: boolean, source: string, action: "install" | "remove" | "update" = "install", error?: string) {
  window.dispatchEvent(
    new CustomEvent("pi-package-event", {
      detail: {
        type: "package_operation_complete",
        operationId: opId,
        action,
        source,
        scope: "global",
        success,
        error,
      },
    }),
  );
}

function makeFetchMock(responder: (req: { url: string; body: any }, callIndex: number) => Promise<Response> | Response) {
  let calls = 0;
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const idx = calls++;
    return responder({ url, body }, idx);
  });
}

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

// Flush microtasks (fetch promise + .json() chain + handlers) without
// advancing fake timers — so retry-backoff setTimeout(500) does NOT fire.
async function flush() {
  // Response.json() and the queue's internal awaits chew through more
  // microtasks than is intuitive; 50 iterations is overkill-safe and cheap.
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe("package-queue", () => {
  beforeEach(() => {
    packageQueue.__resetForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("idle enqueue runs immediately and surfaces running state", async () => {
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: "op-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(packageQueue.getStateForSource("npm:a")).toBe("running");
    expect(packageQueue.getRunning()?.source).toBe("npm:a");
    expect(packageQueue.getQueueDepth()).toBe(0);
  });

  it("second enqueue while running becomes queued", async () => {
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: "op-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    packageQueue.enqueue({ source: "npm:b", action: "install", scope: "global" });

    expect(packageQueue.getStateForSource("npm:a")).toBe("running");
    expect(packageQueue.getStateForSource("npm:b")).toBe("queued");
    expect(packageQueue.getQueueDepth()).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("completion advances FIFO and POSTs next item", async () => {
    let nextOp = 1;
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: `op-${nextOp++}` } }));
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    packageQueue.enqueue({ source: "npm:b", action: "install", scope: "global" });
    packageQueue.enqueue({ source: "npm:c", action: "install", scope: "global" });

    dispatchComplete("op-1", true, "npm:a");
    await flush();

    expect(packageQueue.getStateForSource("npm:a")).toBe("success");
    expect(packageQueue.getStateForSource("npm:b")).toBe("running");
    expect(packageQueue.getStateForSource("npm:c")).toBe("queued");

    dispatchComplete("op-2", true, "npm:b");
    await flush();

    expect(packageQueue.getStateForSource("npm:c")).toBe("running");
    expect(packageQueue.getQueueDepth()).toBe(0);
  });

  it("duplicate enqueue is a no-op while running or queued", async () => {
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: "op-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" }); // dup while running
    packageQueue.enqueue({ source: "npm:b", action: "install", scope: "global" });
    packageQueue.enqueue({ source: "npm:b", action: "install", scope: "global" }); // dup while queued

    expect(fetchMock).toHaveBeenCalledOnce(); // only 'a' POSTed
    expect(packageQueue.getQueueDepth()).toBe(1); // only 'b' once
  });

  it("409 retries once then succeeds", async () => {
    let nextOp = 1;
    const fetchMock = makeFetchMock(async ({}, idx) => {
      if (idx === 0) return jsonResponse({ success: false, error: "busy" }, 409);
      return jsonResponse({ success: true, data: { operationId: `op-${nextOp++}` } });
    });
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();

    expect(packageQueue.getStateForSource("npm:a")).toBe("queued");

    await vi.advanceTimersByTimeAsync(600);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(packageQueue.getStateForSource("npm:a")).toBe("running");
  });

  it("second consecutive 409 surfaces error and advances queue", async () => {
    const fetchMock = makeFetchMock(async ({}, idx) => {
      if (idx < 2) return jsonResponse({ success: false, error: "busy" }, 409);
      return jsonResponse({ success: true, data: { operationId: "op-b" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    packageQueue.enqueue({ source: "npm:b", action: "install", scope: "global" });
    await flush(); // a → 409, scheduled retry, b waits
    await vi.advanceTimersByTimeAsync(600);
    await flush(); // a-retry → 409 → error → advance → POST b

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(packageQueue.getStateForSource("npm:a")).toBe("error");
    expect(packageQueue.getStateForSource("npm:b")).toBe("running");
  });

  it("non-409 error surfaces error immediately and advances", async () => {
    const fetchMock = makeFetchMock(async ({}, idx) => {
      if (idx === 0) return jsonResponse({ success: false, error: "boom" }, 500);
      return jsonResponse({ success: true, data: { operationId: "op-b" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    packageQueue.enqueue({ source: "npm:b", action: "install", scope: "global" });
    await flush();

    expect(packageQueue.getStateForSource("npm:a")).toBe("error");
    expect(packageQueue.getStateForSource("npm:b")).toBe("running");
  });

  it("success auto-clears after 3 seconds", async () => {
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: "op-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    dispatchComplete("op-1", true, "npm:a");
    await flush();

    expect(packageQueue.getStateForSource("npm:a")).toBe("success");
    await vi.advanceTimersByTimeAsync(3100);
    expect(packageQueue.getStateForSource("npm:a")).toBe("idle");
  });

  it("error stays sticky until next enqueue of same source", async () => {
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: "op-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    dispatchComplete("op-1", false, "npm:a", "install", "kaboom");
    await flush();

    expect(packageQueue.getStateForSource("npm:a")).toBe("error");
    await vi.advanceTimersByTimeAsync(10000);
    expect(packageQueue.getStateForSource("npm:a")).toBe("error");

    // Re-enqueue clears sticky error
    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    expect(packageQueue.getStateForSource("npm:a")).toBe("running");
  });

  it("subscribe notifies on every transition", async () => {
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: "op-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const cb = vi.fn();
    const unsub = packageQueue.subscribe(cb);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    dispatchComplete("op-1", true, "npm:a");
    await flush();

    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(2);
    unsub();
  });

  it("ignores complete events whose operationId does not match running", async () => {
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: "op-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    dispatchComplete("op-stale", true, "npm:a");
    await flush();

    expect(packageQueue.getStateForSource("npm:a")).toBe("running");
  });

  it("__resetForTests clears all state", async () => {
    const fetchMock = makeFetchMock(async () => jsonResponse({ success: true, data: { operationId: "op-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    packageQueue.enqueue({ source: "npm:a", action: "install", scope: "global" });
    await flush();
    packageQueue.__resetForTests();

    expect(packageQueue.getRunning()).toBeNull();
    expect(packageQueue.getQueueDepth()).toBe(0);
    expect(packageQueue.getStateForSource("npm:a")).toBe("idle");
  });
});
