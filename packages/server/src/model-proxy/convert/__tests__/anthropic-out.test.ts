/* Ported from BlackBeltTechnology/pi-model-proxy@179d450 test suite.
 * See model-proxy/convert/UPSTREAM.md for divergences.
 */
import { describe, it, expect } from "vitest";
import { AnthropicBlockTracker, eventToAnthropicSSE, eventToAnthropicResponse } from "../anthropic-out.js";

const MODEL = "anthropic/claude-3-5-sonnet";
const MSG_ID = "msg_test";

function parseSSELine(line: string): { eventType: string; data: any } {
  const eventMatch = line.match(/^event: (.+)/m);
  const dataMatch = line.match(/^data: (.+)/m);
  const eventType = eventMatch?.[1] ?? "unknown";
  const data = dataMatch ? JSON.parse(dataMatch[1]) : null;
  return { eventType, data };
}

function makeTracker() {
  return new AnthropicBlockTracker();
}

describe("AnthropicBlockTracker", () => {
  it("starts at -1", () => {
    const t = makeTracker();
    expect(t.getCurrentIndex()).toBe(-1);
  });

  it("nextIndex increments and returns", () => {
    const t = makeTracker();
    expect(t.nextIndex()).toBe(0);
    expect(t.nextIndex()).toBe(1);
    expect(t.getCurrentIndex()).toBe(1);
  });
});

describe("eventToAnthropicSSE", () => {
  it("start emits message_start", () => {
    const chunks = eventToAnthropicSSE({ type: "start" }, MODEL, MSG_ID, makeTracker());
    expect(chunks).toHaveLength(1);
    const { eventType, data } = parseSSELine(chunks[0]);
    expect(eventType).toBe("message_start");
    expect(data.message.id).toBe(MSG_ID);
    expect(data.message.role).toBe("assistant");
  });

  it("text_delta without prior block emits content_block_start then delta", () => {
    const tracker = makeTracker();
    const chunks = eventToAnthropicSSE({ type: "text_delta", delta: "hello" }, MODEL, MSG_ID, tracker);
    expect(chunks).toHaveLength(2);
    const { eventType: et0 } = parseSSELine(chunks[0]);
    const { eventType: et1, data: d1 } = parseSSELine(chunks[1]);
    expect(et0).toBe("content_block_start");
    expect(et1).toBe("content_block_delta");
    expect(d1.delta.text).toBe("hello");
  });

  it("text_delta with existing block emits only delta", () => {
    const tracker = makeTracker();
    tracker.nextIndex(); // simulate existing block at index 0
    const chunks = eventToAnthropicSSE({ type: "text_delta", delta: "more" }, MODEL, MSG_ID, tracker);
    expect(chunks).toHaveLength(1);
    const { eventType, data } = parseSSELine(chunks[0]);
    expect(eventType).toBe("content_block_delta");
    expect(data.delta.text).toBe("more");
  });

  it("thinking_delta emits thinking content_block_start + delta", () => {
    const tracker = makeTracker();
    const chunks = eventToAnthropicSSE({ type: "thinking_delta", delta: "hmm" }, MODEL, MSG_ID, tracker);
    expect(chunks).toHaveLength(2);
    const { data: startData } = parseSSELine(chunks[0]);
    expect(startData.content_block.type).toBe("thinking");
    const { data: deltaData } = parseSSELine(chunks[1]);
    expect(deltaData.delta.type).toBe("thinking_delta");
    expect(deltaData.delta.thinking).toBe("hmm");
  });

  it("toolcall_start closes prior block and opens tool_use block", () => {
    const tracker = makeTracker();
    tracker.nextIndex(); // prior block at 0
    const event = {
      type: "toolcall_start",
      contentIndex: 0,
      partial: { content: [{ type: "toolCall", id: "tc1", name: "my_fn" }] },
    };
    const chunks = eventToAnthropicSSE(event, MODEL, MSG_ID, tracker);
    // Should emit content_block_stop + content_block_start
    expect(chunks).toHaveLength(2);
    const { eventType: et0 } = parseSSELine(chunks[0]);
    const { eventType: et1, data: d1 } = parseSSELine(chunks[1]);
    expect(et0).toBe("content_block_stop");
    expect(et1).toBe("content_block_start");
    expect(d1.content_block.type).toBe("tool_use");
    expect(d1.content_block.name).toBe("my_fn");
  });

  it("toolcall_delta emits input_json_delta", () => {
    const tracker = makeTracker();
    tracker.nextIndex(); // block at 0
    const chunks = eventToAnthropicSSE({ type: "toolcall_delta", delta: '{"x":' }, MODEL, MSG_ID, tracker);
    expect(chunks).toHaveLength(1);
    const { data } = parseSSELine(chunks[0]);
    expect(data.delta.type).toBe("input_json_delta");
    expect(data.delta.partial_json).toBe('{"x":');
  });

  it("done emits content_block_stop + message_delta + message_stop", () => {
    const tracker = makeTracker();
    tracker.nextIndex(); // block at 0
    const msg = { stopReason: "stop", usage: { input: 10, output: 5 }, content: [] };
    const chunks = eventToAnthropicSSE({ type: "done", message: msg }, MODEL, MSG_ID, tracker);
    expect(chunks).toHaveLength(3);
    const { eventType: et0 } = parseSSELine(chunks[0]);
    const { eventType: et1, data: d1 } = parseSSELine(chunks[1]);
    const { eventType: et2 } = parseSSELine(chunks[2]);
    expect(et0).toBe("content_block_stop");
    expect(et1).toBe("message_delta");
    expect(d1.delta.stop_reason).toBe("end_turn");
    expect(d1.usage.output_tokens).toBe(5);
    expect(et2).toBe("message_stop");
  });

  it("done with stopReason=toolUse → stop_reason=tool_use", () => {
    const tracker = makeTracker();
    const msg = { stopReason: "toolUse", usage: { input: 0, output: 0 }, content: [] };
    const chunks = eventToAnthropicSSE({ type: "done", message: msg }, MODEL, MSG_ID, tracker);
    const messageDelta = chunks.find((c) => c.includes("message_delta"));
    expect(messageDelta).toBeDefined();
    const { data } = parseSSELine(messageDelta!);
    expect(data.delta.stop_reason).toBe("tool_use");
  });

  it("done with stopReason=length → stop_reason=max_tokens", () => {
    const tracker = makeTracker();
    const msg = { stopReason: "length", usage: { input: 0, output: 0 }, content: [] };
    const chunks = eventToAnthropicSSE({ type: "done", message: msg }, MODEL, MSG_ID, tracker);
    const messageDelta = chunks.find((c) => c.includes("message_delta"));
    const { data } = parseSSELine(messageDelta!);
    expect(data.delta.stop_reason).toBe("max_tokens");
  });

  it("error emits error event", () => {
    const chunks = eventToAnthropicSSE({ type: "error", error: { errorMessage: "fail" } }, MODEL, MSG_ID, makeTracker());
    expect(chunks).toHaveLength(1);
    const { eventType, data } = parseSSELine(chunks[0]);
    expect(eventType).toBe("error");
    expect(data.error.message).toBe("fail");
  });
});

describe("eventToAnthropicResponse", () => {
  it("text response", () => {
    const msg = {
      content: [{ type: "text", text: "hello" }],
      stopReason: "stop",
      usage: { input: 5, output: 3 },
    };
    const response = eventToAnthropicResponse(msg, MODEL, MSG_ID);
    expect(response.id).toBe(MSG_ID);
    expect(response.role).toBe("assistant");
    expect(response.content[0]).toEqual({ type: "text", text: "hello" });
    expect(response.stop_reason).toBe("end_turn");
    expect(response.usage.input_tokens).toBe(5);
  });

  it("tool_use response", () => {
    const msg = {
      content: [{ type: "toolCall", id: "tc1", name: "fn", arguments: { x: 1 } }],
      stopReason: "toolUse",
      usage: { input: 5, output: 3 },
    };
    const response = eventToAnthropicResponse(msg, MODEL, MSG_ID);
    expect(response.stop_reason).toBe("tool_use");
    expect(response.content[0].type).toBe("tool_use");
    expect(response.content[0].input).toEqual({ x: 1 });
  });

  it("max_tokens stop reason", () => {
    const msg = { content: [], stopReason: "length", usage: { input: 1, output: 1 } };
    const response = eventToAnthropicResponse(msg, MODEL, MSG_ID);
    expect(response.stop_reason).toBe("max_tokens");
  });
});
