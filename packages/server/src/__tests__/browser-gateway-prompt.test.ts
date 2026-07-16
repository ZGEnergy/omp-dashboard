import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createBrowserGateway } from "../browser-gateway.js";
import { createMemorySessionManager } from "../memory-session-manager.js";
import { createMemoryEventStore } from "../memory-event-store.js";
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

  it("keeps one response queued until the bridge confirms dismissal, even after a long disconnect", async () => {
    const piGateway = makeStubPiGateway();
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const gateway = createBrowserGateway(
      createMemorySessionManager(),
      createMemoryEventStore(() => false),
      piGateway,
    );
    gateway.trackPromptRequest("s1", promptRequest);
    gateway.trackPromptRequest("s1", secondPromptRequest);
    const ws = makeFakeWs();
    connectAndSubscribe(gateway, ws, "s1");
    await flush();
    (piGateway.sendToSession as ReturnType<typeof vi.fn>).mockClear();

    vi.useFakeTimers();
    try {
      ws.emit("message", Buffer.from(JSON.stringify({
        type: "prompt_response", sessionId: "s1", promptId: "prompt-1", answer: "A", source: "dashboard-default",
      })));
      await vi.advanceTimersByTimeAsync(185_000);
      const attemptsAtThreeMinutes = (piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length;
      await vi.advanceTimersByTimeAsync(80_000);
      expect((piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(attemptsAtThreeMinutes);

      const replay = makeFakeWs();
      connectAndSubscribe(gateway, replay, "s1");
      expect(sentMessages(replay).filter((m) => m.type === "prompt_request").map((m) => m.promptId)).toEqual(["prompt-2"]);

      const attemptsBeforeDismiss = (piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length;
      gateway.clearPromptRequest("s1", "prompt-1");
      await vi.advanceTimersByTimeAsync(60_000);
      expect((piGateway.sendToSession as ReturnType<typeof vi.fn>).mock.calls.length).toBe(attemptsBeforeDismiss);
    } finally {
      vi.useRealTimers();
    }
  });
});
