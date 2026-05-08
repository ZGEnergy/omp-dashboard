/* Ported from BlackBeltTechnology/pi-model-proxy@179d450 test suite.
 * See model-proxy/convert/UPSTREAM.md for divergences.
 */
import { describe, it, expect } from "vitest";
import { ToolCallIndexTracker, eventToSSEChunks, eventToNonStreamingResponse } from "../openai-out.js";

function parseSSE(chunk: string): { data: any } {
  const lines = chunk.trim().split("\n");
  const dataLine = lines.find((l) => l.startsWith("data: "));
  if (!dataLine) throw new Error(`No data line in chunk: ${chunk}`);
  const raw = dataLine.slice(6);
  if (raw === "[DONE]") return { data: "[DONE]" };
  return { data: JSON.parse(raw) };
}

const MODEL = "anthropic/claude-3-5-sonnet";
const MSG_ID = "test-id";

function makeTracker() {
  return new ToolCallIndexTracker();
}

describe("ToolCallIndexTracker", () => {
  it("assigns sequential indices", () => {
    const t = makeTracker();
    expect(t.getIndex("a")).toBe(0);
    expect(t.getIndex("b")).toBe(1);
    expect(t.getIndex("a")).toBe(0); // idempotent
  });

  it("getIndexByContentIndex resolves via toolCall id", () => {
    const t = makeTracker();
    t.getIndex("tc1");
    const content = [{ type: "toolCall", id: "tc1" }];
    expect(t.getIndexByContentIndex(0, content)).toBe(0);
  });

  it("getIndexByContentIndex returns 0 for non-toolCall", () => {
    const t = makeTracker();
    expect(t.getIndexByContentIndex(0, [{ type: "text" }])).toBe(0);
  });
});

describe("eventToSSEChunks", () => {
  it("start event emits assistant role chunk", () => {
    const chunks = eventToSSEChunks({ type: "start" }, MODEL, MSG_ID, makeTracker());
    expect(chunks).toHaveLength(1);
    const { data } = parseSSE(chunks[0]);
    expect(data.choices[0].delta.role).toBe("assistant");
    expect(data.object).toBe("chat.completion.chunk");
  });

  it("text_delta emits content chunk", () => {
    const chunks = eventToSSEChunks({ type: "text_delta", delta: "hello" }, MODEL, MSG_ID, makeTracker());
    expect(chunks).toHaveLength(1);
    const { data } = parseSSE(chunks[0]);
    expect(data.choices[0].delta.content).toBe("hello");
  });

  it("thinking_delta emits reasoning_content chunk", () => {
    const chunks = eventToSSEChunks({ type: "thinking_delta", delta: "thinking..." }, MODEL, MSG_ID, makeTracker());
    expect(chunks).toHaveLength(1);
    const { data } = parseSSE(chunks[0]);
    expect(data.choices[0].delta.reasoning_content).toBe("thinking...");
  });

  it("toolcall_start emits tool_calls chunk with index 0", () => {
    const tracker = makeTracker();
    const event = {
      type: "toolcall_start",
      contentIndex: 0,
      partial: { content: [{ type: "toolCall", id: "tc1", name: "my_fn" }] },
    };
    const chunks = eventToSSEChunks(event, MODEL, MSG_ID, tracker);
    expect(chunks).toHaveLength(1);
    const { data } = parseSSE(chunks[0]);
    const tc = data.choices[0].delta.tool_calls[0];
    expect(tc.index).toBe(0);
    expect(tc.function.name).toBe("my_fn");
  });

  it("toolcall_delta emits argument delta", () => {
    const tracker = makeTracker();
    tracker.getIndex("tc1");
    const event = {
      type: "toolcall_delta",
      contentIndex: 0,
      delta: '{"x":',
      partial: { content: [{ type: "toolCall", id: "tc1" }] },
    };
    const chunks = eventToSSEChunks(event, MODEL, MSG_ID, tracker);
    expect(chunks).toHaveLength(1);
    const { data } = parseSSE(chunks[0]);
    expect(data.choices[0].delta.tool_calls[0].function.arguments).toBe('{"x":');
  });

  it("done event emits finish chunk + [DONE]", () => {
    const msg = {
      stopReason: "stop",
      usage: { input: 10, output: 5 },
      content: [],
    };
    const chunks = eventToSSEChunks({ type: "done", message: msg }, MODEL, MSG_ID, makeTracker());
    expect(chunks).toHaveLength(2);
    const { data } = parseSSE(chunks[0]);
    expect(data.choices[0].finish_reason).toBe("stop");
    expect(data.usage.prompt_tokens).toBe(10);
    expect(chunks[1].trim()).toBe("data: [DONE]");
  });

  it("done with stopReason=toolUse → finish_reason=tool_calls", () => {
    const msg = { stopReason: "toolUse", usage: { input: 0, output: 0 }, content: [] };
    const chunks = eventToSSEChunks({ type: "done", message: msg }, MODEL, MSG_ID, makeTracker());
    const { data } = parseSSE(chunks[0]);
    expect(data.choices[0].finish_reason).toBe("tool_calls");
  });

  it("done with stopReason=length → finish_reason=length", () => {
    const msg = { stopReason: "length", usage: { input: 0, output: 0 }, content: [] };
    const chunks = eventToSSEChunks({ type: "done", message: msg }, MODEL, MSG_ID, makeTracker());
    const { data } = parseSSE(chunks[0]);
    expect(data.choices[0].finish_reason).toBe("length");
  });

  it("error event emits stop chunk + [DONE]", () => {
    const chunks = eventToSSEChunks({ type: "error", error: { errorMessage: "fail" } }, MODEL, MSG_ID, makeTracker());
    expect(chunks).toHaveLength(2);
    const { data } = parseSSE(chunks[0]);
    expect(data.choices[0].finish_reason).toBe("stop");
    expect(chunks[1].trim()).toBe("data: [DONE]");
  });
});

describe("eventToNonStreamingResponse", () => {
  it("text-only response", () => {
    const msg = {
      content: [{ type: "text", text: "hello" }],
      stopReason: "stop",
      usage: { input: 5, output: 3 },
    };
    const response = eventToNonStreamingResponse(msg, MODEL, MSG_ID);
    expect(response.object).toBe("chat.completion");
    expect(response.choices[0].message.content).toBe("hello");
    expect(response.choices[0].finish_reason).toBe("stop");
    expect(response.usage.prompt_tokens).toBe(5);
    expect(response.usage.completion_tokens).toBe(3);
  });

  it("tool call response", () => {
    const msg = {
      content: [{ type: "toolCall", id: "tc1", name: "fn", arguments: { x: 1 } }],
      stopReason: "toolUse",
      usage: { input: 5, output: 3 },
    };
    const response = eventToNonStreamingResponse(msg, MODEL, MSG_ID);
    expect(response.choices[0].finish_reason).toBe("tool_calls");
    expect(response.choices[0].message.tool_calls[0].function.name).toBe("fn");
    expect(response.choices[0].message.content).toBeNull();
  });

  it("length stop reason", () => {
    const msg = { content: [], stopReason: "length", usage: { input: 1, output: 1 } };
    const response = eventToNonStreamingResponse(msg, MODEL, MSG_ID);
    expect(response.choices[0].finish_reason).toBe("length");
  });
});
