import { describe, expect, it } from "vitest";
import { createInitialState, reduceEvent } from "../event-reducer.js";

describe("cold replay thinking state (#118)", () => {
  it("keeps streamingThinking empty during mid-thought cold replay batch while accumulating pendingThinking", () => {
    let state = createInitialState();

    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: 1000,
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });

    expect(state.streamingThinking).toBe("");
    expect(state.pendingThinking).toBe("");

    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: 1100,
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Deep reasoning step 1..." },
      },
    });

    expect(state.streamingThinking).toBe("");
    expect(state.pendingThinking).toBe("Deep reasoning step 1...");

    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: 1200,
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: " step 2." },
      },
    });

    expect(state.streamingThinking).toBe("");
    expect(state.pendingThinking).toBe("Deep reasoning step 1... step 2.");
  });

  it("creates thinking message with streamedLive: false on cold replay thinking_end", () => {
    let state = createInitialState();

    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: 1000,
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });

    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: 1100,
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Replayed reasoning" },
      },
    });

    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: 2000,
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_end", contentIndex: 0 },
      },
    });

    expect(state.streamingThinking).toBe("");
    expect(state.pendingThinking).toBeUndefined();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      role: "thinking",
      content: "Replayed reasoning",
      timestamp: 2000,
      startedAt: 1000,
      duration: 1000,
      streamedLive: false,
    });
  });

  it("populates streamingThinking during live stream and sets streamedLive: true on thinking_end", () => {
    let state = createInitialState();

    state = reduceEvent(
      state,
      {
        eventType: "message_update",
        timestamp: 1000,
        data: {
          message: { role: "assistant", content: [] },
          assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
        },
      },
      { isLive: true },
    );

    expect(state.streamingThinking).toBe("");
    expect(state.pendingThinking).toBe("");

    state = reduceEvent(
      state,
      {
        eventType: "message_update",
        timestamp: 1100,
        data: {
          message: { role: "assistant", content: [] },
          assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Live thinking" },
        },
      },
      { isLive: true },
    );

    expect(state.streamingThinking).toBe("Live thinking");
    expect(state.pendingThinking).toBe("Live thinking");

    state = reduceEvent(
      state,
      {
        eventType: "message_update",
        timestamp: 2500,
        data: {
          message: { role: "assistant", content: [] },
          assistantMessageEvent: { type: "thinking_end", contentIndex: 0 },
        },
      },
      { isLive: true },
    );

    expect(state.streamingThinking).toBe("");
    expect(state.pendingThinking).toBeUndefined();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      role: "thinking",
      content: "Live thinking",
      timestamp: 2500,
      startedAt: 1000,
      duration: 1500,
      streamedLive: true,
    });
  });
});
