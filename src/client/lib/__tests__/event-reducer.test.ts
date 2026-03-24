import { describe, it, expect } from "vitest";
import { createInitialState, reduceEvent, toDisplayString, type SessionState } from "../event-reducer.js";
import type { DashboardEvent } from "../../../shared/types.js";

function applyEvents(events: DashboardEvent[]): SessionState {
  return events.reduce(reduceEvent, createInitialState());
}

describe("eventReducer", () => {
  it("should start with empty state", () => {
    const state = createInitialState();
    expect(state.messages).toHaveLength(0);
    expect(state.isStreaming).toBe(false);
    expect(state.status).toBe("idle");
  });

  it("should add user messages from message_start", () => {
    const state = applyEvents([
      {
        eventType: "message_start",
        timestamp: Date.now(),
        data: {
          message: {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
          },
        },
      },
    ]);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");
    expect(state.messages[0].content).toBe("Hello");
    expect(state.messages[0].images).toBeUndefined();
  });

  it("should extract images from user message content", () => {
    const state = applyEvents([
      {
        eventType: "message_start",
        timestamp: Date.now(),
        data: {
          message: {
            role: "user",
            content: [
              { type: "text", text: "Check this image" },
              { type: "image", data: "abc123", mimeType: "image/png" },
            ],
          },
        },
      },
    ]);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].content).toBe("Check this image");
    expect(state.messages[0].images).toHaveLength(1);
    expect(state.messages[0].images![0]).toEqual({ data: "abc123", mimeType: "image/png" });
  });

  it("should skip image blocks with missing data or mimeType", () => {
    const state = applyEvents([
      {
        eventType: "message_start",
        timestamp: Date.now(),
        data: {
          message: {
            role: "user",
            content: [
              { type: "text", text: "test" },
              { type: "image", data: "", mimeType: "image/png" },
              { type: "image", data: "valid", mimeType: undefined },
              { type: "image", data: "good", mimeType: "image/jpeg" },
            ],
          },
        },
      },
    ]);

    expect(state.messages[0].images).toHaveLength(1);
    expect(state.messages[0].images![0]).toEqual({ data: "good", mimeType: "image/jpeg" });
  });

  it("should handle user message with string content (no array)", () => {
    const state = applyEvents([
      {
        eventType: "message_start",
        timestamp: Date.now(),
        data: {
          message: {
            role: "user",
            content: "plain string message",
          },
        },
      },
    ]);

    expect(state.messages[0].content).toBe("plain string message");
    expect(state.messages[0].images).toBeUndefined();
  });

  it("should track streaming text from message_update", () => {
    const state = applyEvents([
      {
        eventType: "agent_start",
        timestamp: Date.now(),
        data: {},
      },
      {
        eventType: "message_update",
        timestamp: Date.now(),
        data: {
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Hello world" }],
          },
        },
      },
    ]);

    expect(state.isStreaming).toBe(true);
    expect(state.streamingText).toBe("Hello world");
  });

  it("should finalize assistant message on message_end", () => {
    const state = applyEvents([
      {
        eventType: "agent_start",
        timestamp: Date.now(),
        data: {},
      },
      {
        eventType: "message_update",
        timestamp: Date.now(),
        data: {
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Final answer" }],
          },
        },
      },
      {
        eventType: "message_end",
        timestamp: Date.now(),
        data: {
          message: { role: "assistant" },
        },
      },
    ]);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("assistant");
    expect(state.messages[0].content).toBe("Final answer");
    expect(state.streamingText).toBe("");
  });

  it("should add tool message to messages[] on tool_execution_start with status running and args", () => {
    const state = applyEvents([
      {
        eventType: "tool_execution_start",
        timestamp: Date.now(),
        data: {
          toolCallId: "tc1",
          toolName: "bash",
          args: { command: "ls" },
        },
      },
    ]);

    // toolCalls Map still works
    expect(state.toolCalls.get("tc1")).toBeDefined();
    expect(state.toolCalls.get("tc1")!.toolName).toBe("bash");
    expect(state.toolCalls.get("tc1")!.status).toBe("running");
    expect(state.currentTool).toBe("bash");

    // Message added immediately on start
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].id).toBe("tool-tc1");
    expect(state.messages[0].role).toBe("toolResult");
    expect(state.messages[0].toolName).toBe("bash");
    expect(state.messages[0].toolStatus).toBe("running");
    expect(state.messages[0].args).toEqual({ command: "ls" });
  });

  it("should update existing tool message result on tool_execution_update", () => {
    const state = applyEvents([
      {
        eventType: "tool_execution_start",
        timestamp: Date.now(),
        data: { toolCallId: "tc1", toolName: "bash", args: { command: "ls" } },
      },
      {
        eventType: "tool_execution_update",
        timestamp: Date.now(),
        data: { toolCallId: "tc1", toolName: "bash", partialResult: "file1.ts\nfile2.ts" },
      },
    ]);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].result).toBe("file1.ts\nfile2.ts");
    expect(state.messages[0].toolStatus).toBe("running");
  });

  it("should update existing tool message in-place on tool_execution_end (no duplicate)", () => {
    const state = applyEvents([
      {
        eventType: "tool_execution_start",
        timestamp: Date.now(),
        data: { toolCallId: "tc1", toolName: "read", args: { path: "file.ts" } },
      },
      {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: { toolCallId: "tc1", toolName: "read", isError: false, result: "file content here" },
      },
    ]);

    expect(state.toolCalls.get("tc1")!.status).toBe("complete");
    expect(state.currentTool).toBeUndefined();
    // Only 1 message (updated in-place, not duplicated)
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("toolResult");
    expect(state.messages[0].toolName).toBe("read");
    expect(state.messages[0].toolStatus).toBe("complete");
    expect(state.messages[0].result).toBe("file content here");
    expect(state.messages[0].args).toEqual({ path: "file.ts" });
  });

  it("should truncate tool result to 30 lines", () => {
    const longResult = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join("\n");
    const state = applyEvents([
      {
        eventType: "tool_execution_start",
        timestamp: Date.now(),
        data: { toolCallId: "tc1", toolName: "bash", args: { command: "cat bigfile" } },
      },
      {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: { toolCallId: "tc1", toolName: "bash", isError: false, result: longResult },
      },
    ]);

    const lines = state.messages[0].result!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(30);
  });

  it("should truncate partial result to 30 lines on tool_execution_update", () => {
    const longResult = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join("\n");
    const state = applyEvents([
      {
        eventType: "tool_execution_start",
        timestamp: Date.now(),
        data: { toolCallId: "tc1", toolName: "bash", args: { command: "cat bigfile" } },
      },
      {
        eventType: "tool_execution_update",
        timestamp: Date.now(),
        data: { toolCallId: "tc1", toolName: "bash", partialResult: longResult },
      },
    ]);

    const lines = state.messages[0].result!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(30);
  });

  it("should set status to idle on agent_end", () => {
    const state = applyEvents([
      { eventType: "agent_start", timestamp: Date.now(), data: {} },
      { eventType: "agent_end", timestamp: Date.now(), data: { messages: [] } },
    ]);

    expect(state.status).toBe("idle");
    expect(state.isStreaming).toBe(false);
  });

  it("should handle a full conversation sequence", () => {
    const now = Date.now();
    const state = applyEvents([
      // User message
      {
        eventType: "message_start",
        timestamp: now,
        data: { message: { role: "user", content: [{ type: "text", text: "Fix the bug" }] } },
      },
      // Agent starts
      { eventType: "agent_start", timestamp: now + 1, data: {} },
      // Assistant streams
      {
        eventType: "message_update",
        timestamp: now + 2,
        data: { message: { role: "assistant", content: [{ type: "text", text: "I'll fix it" }] } },
      },
      // Tool call
      {
        eventType: "tool_execution_start",
        timestamp: now + 3,
        data: { toolCallId: "tc1", toolName: "edit", args: {} },
      },
      {
        eventType: "tool_execution_end",
        timestamp: now + 4,
        data: { toolCallId: "tc1", toolName: "edit", isError: false },
      },
      // Message finalized
      {
        eventType: "message_end",
        timestamp: now + 5,
        data: { message: { role: "assistant" } },
      },
      // Agent ends
      { eventType: "agent_end", timestamp: now + 6, data: { messages: [] } },
    ]);

    expect(state.messages).toHaveLength(3); // user + tool (added on start, updated on end) + assistant
    expect(state.status).toBe("idle");
  });

  it("should accumulate tokens and cost from stats_update", () => {
    const state = applyEvents([
      {
        eventType: "stats_update",
        timestamp: Date.now(),
        data: {
          tokensIn: 1000,
          tokensOut: 500,
          cost: 0.01,
        },
      },
      {
        eventType: "stats_update",
        timestamp: Date.now(),
        data: {
          tokensIn: 800,
          tokensOut: 300,
          cost: 0.005,
        },
      },
    ]);

    expect(state.tokensIn).toBe(1800);
    expect(state.tokensOut).toBe(800);
    expect(state.cost).toBeCloseTo(0.015);
  });

  it("should populate turnStats from stats_update with turnUsage", () => {
    const state = applyEvents([
      {
        eventType: "stats_update",
        timestamp: Date.now(),
        data: {
          tokensIn: 1000,
          tokensOut: 500,
          cost: 0.01,
          turnUsage: {
            input: 1000,
            output: 500,
            cacheRead: 200,
            cacheWrite: 100,
          },
        },
      },
    ]);

    expect(state.turnStats).toHaveLength(1);
    expect(state.turnStats[0]).toEqual({
      input: 1000,
      output: 500,
      cacheRead: 200,
      cacheWrite: 100,
    });
  });

  it("should populate contextUsage from stats_update", () => {
    const state = applyEvents([
      {
        eventType: "stats_update",
        timestamp: Date.now(),
        data: {
          tokensIn: 1000,
          tokensOut: 500,
          cost: 0.01,
          contextUsage: { tokens: 19100, contextWindow: 256000 },
        },
      },
    ]);

    expect(state.contextUsage).toEqual({ tokens: 19100, contextWindow: 256000 });
  });

  it("should cap turnStats at 50 entries", () => {
    const events = Array.from({ length: 60 }, (_, i) => ({
      eventType: "stats_update" as const,
      timestamp: Date.now() + i,
      data: {
        tokensIn: 100,
        tokensOut: 50,
        cost: 0.001,
        turnUsage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
      },
    }));

    const state = applyEvents(events);
    expect(state.turnStats).toHaveLength(50);
  });

  it("should handle stats_update without turnUsage gracefully", () => {
    const state = applyEvents([
      {
        eventType: "stats_update",
        timestamp: Date.now(),
        data: { tokensIn: 500, tokensOut: 200, cost: 0.005 },
      },
    ]);

    expect(state.turnStats).toHaveLength(0);
    expect(state.tokensIn).toBe(500);
    expect(state.tokensOut).toBe(200);
  });

  it("should convert object results to string in tool_execution_end", () => {
    const state = applyEvents([
      {
        eventType: "tool_execution_start",
        timestamp: Date.now(),
        data: { toolCallId: "tc-obj", toolName: "bash", args: { command: "ls" } },
      },
      {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: {
          toolCallId: "tc-obj",
          result: { stdout: "file.txt", stderr: "" },
          isError: false,
        },
      },
    ]);

    const toolMsg = state.messages.find((m) => m.toolCallId === "tc-obj");
    expect(toolMsg?.result).not.toContain("[object Object]");
    expect(toolMsg?.result).toContain("file.txt");
  });

  it("should convert content-block array results to text", () => {
    const state = applyEvents([
      {
        eventType: "tool_execution_start",
        timestamp: Date.now(),
        data: { toolCallId: "tc-blocks", toolName: "read", args: { path: "f.txt" } },
      },
      {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: {
          toolCallId: "tc-blocks",
          result: [{ type: "text", text: "hello world" }],
          isError: false,
        },
      },
    ]);

    const toolMsg = state.messages.find((m) => m.toolCallId === "tc-blocks");
    expect(toolMsg?.result).toBe("hello world");
  });

  it("should convert { content: [...] } wrapper results to text", () => {
    const state = applyEvents([
      {
        eventType: "tool_execution_start",
        timestamp: Date.now(),
        data: { toolCallId: "tc-wrap", toolName: "bash", args: { command: "echo hi" } },
      },
      {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: {
          toolCallId: "tc-wrap",
          result: { content: [{ type: "text", text: "hi\n" }] },
          isError: false,
        },
      },
    ]);

    const toolMsg = state.messages.find((m) => m.toolCallId === "tc-wrap");
    expect(toolMsg?.result).toBe("hi\n");
  });
});

describe("model_select event", () => {
  it("should update model from model_select", () => {
    const state = applyEvents([
      {
        eventType: "model_select",
        timestamp: Date.now(),
        data: {
          type: "model_select",
          model: { provider: "anthropic", id: "claude-opus-4-6" },
        },
      },
    ]);
    expect(state.model).toBe("anthropic/claude-opus-4-6");
  });

  it("should update thinkingLevel from model_select event data", () => {
    const state = applyEvents([
      {
        eventType: "model_select",
        timestamp: Date.now(),
        data: {
          type: "model_select",
          model: { provider: "anthropic", id: "claude-opus-4-6" },
          thinkingLevel: "high",
        },
      },
    ]);
    expect(state.model).toBe("anthropic/claude-opus-4-6");
    expect(state.thinkingLevel).toBe("high");
  });
});

describe("thinking events", () => {
  it("should initialize streamingThinking to empty string", () => {
    const state = createInitialState();
    expect(state.streamingThinking).toBe("");
  });

  it("should reset streamingThinking on thinking_start", () => {
    let state = createInitialState();
    state = { ...state, streamingThinking: "leftover" };
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });
    expect(state.streamingThinking).toBe("");
  });

  it("should accumulate thinking deltas", () => {
    let state = createInitialState();
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Let me think" },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: " about this..." },
      },
    });
    expect(state.streamingThinking).toBe("Let me think about this...");
  });

  it("should create thinking message on thinking_end and reset streamingThinking", () => {
    let state = createInitialState();
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Deep reasoning here" },
      },
    });
    const ts = Date.now();
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: ts,
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: "Deep reasoning here" },
      },
    });
    expect(state.streamingThinking).toBe("");
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("thinking");
    expect(state.messages[0].content).toBe("Deep reasoning here");
    expect(state.messages[0].timestamp).toBe(ts);
  });

  it("should skip creating thinking message when streamingThinking is empty", () => {
    let state = createInitialState();
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });
    // thinking_end with no deltas
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: "" },
      },
    });
    expect(state.messages).toHaveLength(0);
    expect(state.streamingThinking).toBe("");
  });

  it("should handle multiple thinking blocks in sequence", () => {
    let state = createInitialState();
    // First thinking block
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "First thought" },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: "First thought" },
      },
    });
    // Second thinking block
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 1 },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 1, delta: "Second thought" },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_end", contentIndex: 1, content: "Second thought" },
      },
    });
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0].role).toBe("thinking");
    expect(state.messages[0].content).toBe("First thought");
    expect(state.messages[1].role).toBe("thinking");
    expect(state.messages[1].content).toBe("Second thought");
  });

  it("should store full reasoning text without truncation", () => {
    const longThinking = "x".repeat(10000);
    let state = createInitialState();
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: longThinking },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: longThinking },
      },
    });
    expect(state.messages[0].content).toHaveLength(10000);
  });

  it("should not interfere with text streaming during thinking", () => {
    let state = createInitialState();
    state = reduceEvent(state, { eventType: "agent_start", timestamp: Date.now(), data: {} });
    // Thinking happens
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0 },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "reasoning" },
      },
    });
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: "reasoning" },
      },
    });
    // Then text streams
    state = reduceEvent(state, {
      eventType: "message_update",
      timestamp: Date.now(),
      data: {
        message: { role: "assistant", content: [{ type: "text", text: "Here is the answer" }] },
        assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Here is the answer" },
      },
    });
    expect(state.messages).toHaveLength(1); // thinking message
    expect(state.messages[0].role).toBe("thinking");
    expect(state.streamingText).toBe("Here is the answer");
    expect(state.streamingThinking).toBe("");
  });
});

describe("toDisplayString", () => {
  it("returns empty string for null/undefined", () => {
    expect(toDisplayString(null)).toBe("");
    expect(toDisplayString(undefined)).toBe("");
  });

  it("returns string as-is", () => {
    expect(toDisplayString("hello")).toBe("hello");
  });

  it("extracts text from content block arrays", () => {
    const blocks = [
      { type: "text", text: "line 1" },
      { type: "text", text: "line 2" },
    ];
    expect(toDisplayString(blocks)).toBe("line 1\nline 2");
  });

  it("extracts text from { content: [...] } wrapper object", () => {
    const wrapped = {
      content: [{ type: "text", text: "hello from wrapper" }],
    };
    expect(toDisplayString(wrapped)).toBe("hello from wrapper");
  });

  it("JSON-stringifies plain objects", () => {
    expect(toDisplayString({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("converts numbers to string", () => {
    expect(toDisplayString(42)).toBe("42");
  });
});
