import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_EVENT_DATA_SIZE, DEFAULT_MAX_STRING_SIZE, truncateEvent } from "../memory-event-store.js";

const big = "w".repeat(50_000);

describe("message-content preservation (Task 4.2)", () => {
  it("retains a >20KB assistant text message whole", () => {
    const e = {
      eventType: "message_end",
      timestamp: 0,
      data: { message: { role: "assistant", content: [{ type: "text", text: big }] } },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect(out.data.__truncated).toBeUndefined();
    expect((out.data as any).message.content[0].text).toBe(big);
  });

  it("retains reasoning/thinking text uncapped (real shape: type 'thinking', field 'thinking')", () => {
    // Real shape per replay-coordinator.ts `isToolOnlyAssistantMessage`: content blocks
    // with `type: "thinking"` carry the text under either `.thinking` or `.text`.
    const e = {
      eventType: "message_end",
      timestamp: 0,
      data: { message: { role: "assistant", content: [{ type: "thinking", thinking: big }] } },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect(out.data.__truncated).toBeUndefined();
    expect((out.data as any).message.content[0].thinking).toBe(big);
  });

  it("retains user text uncapped", () => {
    const e = {
      eventType: "message_start",
      timestamp: 0,
      data: { message: { role: "user", content: big } },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect(out.data.__truncated).toBeUndefined();
    expect((out.data as any).message.content).toBe(big);
  });

  it("retains user text blocks (array content) uncapped", () => {
    const e = {
      eventType: "message_end",
      timestamp: 0,
      data: { message: { role: "user", content: [{ type: "text", text: big }] } },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect(out.data.__truncated).toBeUndefined();
    expect((out.data as any).message.content[0].text).toBe(big);
  });

  it("still truncates a >20KB tool output (tool_execution_end)", () => {
    const e = {
      eventType: "tool_execution_end",
      timestamp: 0,
      data: { toolCallId: "t", result: big },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect(JSON.stringify(out).includes(big)).toBe(false);
  });

  it("still caps tool args/output nested inside a protected message event", () => {
    // A message event that also carries an oversized non-message field (e.g. tool
    // args echoed alongside) must still have that field capped by truncateStrings,
    // even though the whole-event scalar collapse is skipped for protected messages.
    const e = {
      eventType: "message_end",
      timestamp: 0,
      data: {
        message: { role: "assistant", content: [{ type: "text", text: "short" }] },
        toolArgs: big,
      },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect(out.data.__truncated).toBeUndefined();
    expect((out.data as any).toolArgs.length).toBeLessThan(big.length);
  });

  it("preserves a large text and thinking block inside an assistant content array with >20 blocks", () => {
    // Regression: truncateStrings collapsed ANY array with >20 elements to the literal
    // "[array truncated]" regardless of context, so a protected message's content array
    // with >=21 blocks lost all its text. Must instead recurse per-block.
    const filler = Array.from({ length: 20 }, (_, i) => ({ type: "tool_use", id: `t${i}`, input: { x: 1 } }));
    const bigToolInput = "y".repeat(50_000);
    const e = {
      eventType: "message_end",
      timestamp: 0,
      data: {
        message: {
          role: "assistant",
          content: [
            ...filler,
            { type: "text", text: big },
            { type: "thinking", thinking: big },
            { type: "tool_use", id: "big-tool", input: { arg: bigToolInput } },
          ],
        },
      },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    const content = (out.data as any).message.content;
    expect(content).not.toBe("[array truncated]");
    expect(content.length).toBe(23);
    const textBlock = content.find((b: any) => b.type === "text");
    const thinkingBlock = content.find((b: any) => b.type === "thinking");
    const toolBlock = content.find((b: any) => b.id === "big-tool");
    expect(textBlock.text).toBe(big);
    expect(thinkingBlock.thinking).toBe(big);
    expect(toolBlock.input.arg.length).toBeLessThan(bigToolInput.length);
  });

  it("preserves a large text block inside a user content array with >20 blocks", () => {
    const filler = Array.from({ length: 21 }, (_, i) => ({ type: "tool_use", id: `t${i}`, input: {} }));
    const e = {
      eventType: "message_end",
      timestamp: 0,
      data: { message: { role: "user", content: [...filler, { type: "text", text: big }] } },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    const content = (out.data as any).message.content;
    expect(content).not.toBe("[array truncated]");
    const textBlock = content.find((b: any) => b.type === "text");
    expect(textBlock.text).toBe(big);
  });

  it("still collapses a >20-element array in normal (non-message) context", () => {
    const bigArray = Array.from({ length: 25 }, (_, i) => `item-${i}`);
    const e = {
      eventType: "tool_execution_end",
      timestamp: 0,
      data: { toolCallId: "t", items: bigArray },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect((out.data as any).items).toBe("[array truncated]");
  });

  it("retains reasoning text uncapped under the 'reasoning' field (finish reasoning wiring)", () => {
    const e = {
      eventType: "message_end",
      timestamp: 0,
      data: { message: { role: "assistant", content: [{ type: "reasoning", reasoning: big }] } },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect(out.data.__truncated).toBeUndefined();
    expect((out.data as any).message.content[0].reasoning).toBe(big);
  });

  it("retains reasoning text uncapped under the 'text' field", () => {
    const e = {
      eventType: "message_end",
      timestamp: 0,
      data: { message: { role: "assistant", content: [{ type: "reasoning", text: big }] } },
    } as any;
    const out = truncateEvent(e, DEFAULT_MAX_STRING_SIZE, DEFAULT_MAX_EVENT_DATA_SIZE);
    expect(out.data.__truncated).toBeUndefined();
    expect((out.data as any).message.content[0].text).toBe(big);
  });
});
