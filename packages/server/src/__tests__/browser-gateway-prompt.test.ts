import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createBrowserGateway } from "../browser-gateway.js";
import { createMemoryEventStore } from "../memory-event-store.js";
import { createMemorySessionManager } from "../memory-session-manager.js";
import type { PiGateway } from "../pi-gateway.js";

function makeFakeWs() {
  const ws = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    readyState: number;
    OPEN: number;
  };
  ws.send = vi.fn();
  ws.close = vi.fn();
  ws.readyState = 1;
  ws.OPEN = 1;
  return ws;
}

function makeStubPiGateway(): PiGateway {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    sendToSession: vi.fn(() => true),
    getConnectedSessionIds: vi.fn(() => []),
    hasSession: vi.fn(() => false),
    onEvent: vi.fn(),
  } as unknown as PiGateway;
}

function makePromptGateway(piGateway: PiGateway, maxAgeMs?: number) {
  return createBrowserGateway(
    createMemorySessionManager(),
    createMemoryEventStore(() => false),
    piGateway,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    maxAgeMs,
  );
}

function sentMessages(ws: ReturnType<typeof makeFakeWs>) {
  return ws.send.mock.calls
    .map(([raw]) => {
      try {
        return JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((msg): msg is Record<string, unknown> => msg !== null);
}

function connectAndSubscribe(gateway: ReturnType<typeof createBrowserGateway>, ws: ReturnType<typeof makeFakeWs>, sessionId: string) {
  gateway.wss.emit("connection", ws, {});
  ws.emit("message", Buffer.from(JSON.stringify({ type: "subscribe", sessionId })));
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const promptRequest = {
  type: "prompt_request",
  sessionId: "s1",
  promptId: "prompt-1",
  prompt: {
    question: "Pick one",
    type: "select",
    options: ["A", "B"],
    pipeline: "command",
    metadata: { toolCallId: "tool-1" },
  },
  component: { type: "generic-dialog", props: {} },
  placement: "inline",
};

const secondPromptRequest = {
  ...promptRequest,
  promptId: "prompt-2",
  prompt: { ...promptRequest.prompt, question: "Pick two" },
};


describe("browser gateway PromptBus replay and response routing", () => {
  it("replays stable pending prompts once and clears only the answered request", async () => {
    const piGateway = makeStubPiGateway();
    const gateway = createBrowserGateway(
      createMemorySessionManager(),
      createMemoryEventStore(() => false),
      piGateway,
    );
    gateway.trackPromptRequest("s1", promptRequest);
    gateway.trackPromptRequest("s1", secondPromptRequest);

    const first = makeFakeWs();
    connectAndSubscribe(gateway, first, "s1");
    await flush();
    expect(sentMessages(first).filter((m) => m.type === "prompt_request")).toHaveLength(2);
    expect(sentMessages(first).filter((m) => m.type === "prompt_request").map((m) => m.promptId)).toEqual(["prompt-1", "prompt-2"]);

    first.emit("close");
    const reconnect = makeFakeWs();
    connectAndSubscribe(gateway, reconnect, "s1");
    await flush();
    expect(sentMessages(reconnect).filter((m) => m.type === "prompt_request")).toHaveLength(2);
    expect(sentMessages(reconnect).filter((m) => m.type === "prompt_request").map((m) => m.promptId)).toEqual(["prompt-1", "prompt-2"]);
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockClear();

    reconnect.emit(
      "message",
      Buffer.from(JSON.stringify({
        type: "prompt_response",
        sessionId: "s1",
        promptId: "prompt-1",
        answer: "A",
        source: "dashboard-default",
      })),
    );
    await flush();
    expect(piGateway.sendToSession).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ type: "prompt_response", promptId: "prompt-1", answer: "A" }),
    );

    const afterResponse = makeFakeWs();
    connectAndSubscribe(gateway, afterResponse, "s1");
    await flush();
    expect(sentMessages(afterResponse).filter((m) => m.type === "prompt_request")).toHaveLength(1);
    expect(sentMessages(afterResponse).find((m) => m.type === "prompt_request")?.promptId).toBe("prompt-2");
  });

  it("stops retrying after the response max age", async () => {
    const piGateway = makeStubPiGateway();
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const gateway = makePromptGateway(piGateway);
    const ws = makeFakeWs();
    connectAndSubscribe(gateway, ws, "s1");
    await flush();
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockClear();

    vi.useFakeTimers();
    try {
      ws.emit("message", Buffer.from(JSON.stringify({
        type: "prompt_response", sessionId: "s1", promptId: "prompt-1", answer: "A", source: "dashboard-default",
      })));
      await vi.advanceTimersByTimeAsync(60_001);
      const attemptsAtExpiry = (piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect((piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length).toBe(attemptsAtExpiry);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying after ten retries even before the max age", async () => {
    const piGateway = makeStubPiGateway();
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const gateway = makePromptGateway(piGateway, 1_000_000);
    const ws = makeFakeWs();
    connectAndSubscribe(gateway, ws, "s1");
    await flush();
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockClear();

    vi.useFakeTimers();
    try {
      ws.emit("message", Buffer.from(JSON.stringify({
        type: "prompt_response", sessionId: "s1", promptId: "prompt-1", answer: "A", source: "dashboard-default",
      })));
      await vi.advanceTimersByTimeAsync(200_000);
      const attemptsAfterRetryCap = (piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(attemptsAfterRetryCap).toBe(11);
      await vi.advanceTimersByTimeAsync(1_000_000);
      expect((piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length).toBe(attemptsAfterRetryCap);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears queued responses when a session is unregistered", async () => {
    const piGateway = makeStubPiGateway();
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const gateway = makePromptGateway(piGateway);
    const ws = makeFakeWs();
    connectAndSubscribe(gateway, ws, "s1");
    await flush();
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockClear();

    vi.useFakeTimers();
    try {
      ws.emit("message", Buffer.from(JSON.stringify({
        type: "prompt_response", sessionId: "s1", promptId: "prompt-1", answer: "A", source: "dashboard-default",
      })));
      const attemptsBeforeClear = (piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length;
      gateway.clearPendingPromptResponses("s1");
      await vi.advanceTimersByTimeAsync(60_000);
      expect((piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length).toBe(attemptsBeforeClear);
    } finally {
      vi.useRealTimers();
    }
  });
});
