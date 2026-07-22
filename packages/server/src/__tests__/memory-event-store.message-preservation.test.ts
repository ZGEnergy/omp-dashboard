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
});
