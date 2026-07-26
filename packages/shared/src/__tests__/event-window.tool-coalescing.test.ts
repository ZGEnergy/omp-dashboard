import { describe, expect, it } from "vitest";
import type { DashboardEvent } from "../types.js";
import {
  DEFAULT_TAIL_WINDOW_BYTES,
  selectNewestEventsByBudget,
  type SeqEvent,
} from "../event-window.js";
import { prepareEventForReplay } from "../prepare-event-for-replay.js";

describe("tool event payload capping and window selection", () => {
  it("caps tool_execution_end and tool_execution_update result payload at maxToolPayloadBytes", () => {
    const largeResult = "x".repeat(50_000);
    const endEvent: DashboardEvent = {
      eventType: "tool_execution_end",
      timestamp: 1000,
      data: { toolCallId: "call-1", toolName: "write", result: largeResult },
    };

    const prepared = prepareEventForReplay(endEvent, { maxToolPayloadBytes: 20 * 1024 });
    const result = String(prepared.event.data.result);
    expect(result.startsWith("«")).toBe(true);
    expect(new TextEncoder().encode(result).byteLength).toBeLessThanOrEqual(20 * 1024 + 100);

    const updateEvent: DashboardEvent = {
      eventType: "tool_execution_update",
      timestamp: 900,
      data: { toolCallId: "call-1", toolName: "write", partialResult: largeResult },
    };

    const preparedUpdate = prepareEventForReplay(updateEvent, { maxToolPayloadBytes: 20 * 1024 });
    const partialResult = String(preparedUpdate.event.data.partialResult);
    expect(partialResult.startsWith("«")).toBe(true);
    expect(new TextEncoder().encode(partialResult).byteLength).toBeLessThanOrEqual(20 * 1024 + 100);
  });

  it("caps nested partial-result text without flattening tool details", () => {
    const event: DashboardEvent = {
      eventType: "tool_execution_update",
      timestamp: 1000,
      data: {
        toolCallId: "call-1",
        toolName: "Agent",
        partialResult: { details: { state: "running", output: "x".repeat(50_000) } },
      },
    };

    const prepared = prepareEventForReplay(event, { maxToolPayloadBytes: 20 * 1024 });
    const partialResult = prepared.event.data.partialResult as { details?: { state?: string; output?: string } };
    expect(partialResult.details?.state).toBe("running");
    expect(partialResult.details?.output?.startsWith("«")).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(partialResult)).byteLength).toBeLessThanOrEqual(20 * 1024 + 100);
  });

  it("summarizes structurally oversized details without exceeding the cap", () => {
    const entries = Object.fromEntries(Array.from({ length: 5_000 }, (_, index) => [`entry-${index}`, "value"]));
    const event: DashboardEvent = {
      eventType: "tool_execution_update",
      timestamp: 1000,
      data: { toolCallId: "call-1", toolName: "Agent", partialResult: { details: { state: "running", entries } } },
    };

    const prepared = prepareEventForReplay(event, { maxToolPayloadBytes: 20 * 1024 });
    const partialResult = prepared.event.data.partialResult as { details?: { state?: string; truncated?: boolean } };
    expect(partialResult.details).toMatchObject({ state: "running", truncated: true });
    expect(new TextEncoder().encode(JSON.stringify(partialResult)).byteLength).toBeLessThanOrEqual(20 * 1024);
  });
  it("applies serialized-byte-safe truncation to quote-heavy tool_execution_end result", () => {
    const quoteHeavyResult = '"'.repeat(30_000);
    const endEvent: DashboardEvent = {
      eventType: "tool_execution_end",
      timestamp: 1000,
      data: {
        toolCallId: "call-quote-heavy",
        toolName: "bash",
        result: quoteHeavyResult,
      },
    };

    const prepared = prepareEventForReplay(endEvent, { maxToolPayloadBytes: 20 * 1024 });
    const result = String(prepared.event.data.result);
    expect(result.startsWith("«")).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(20 * 1024);
  });

  it("retains agentId in details when summarizing structurally oversized details", () => {
    const entries = Object.fromEntries(Array.from({ length: 5_000 }, (_, index) => [`entry-${index}`, "value"]));
    const event: DashboardEvent = {
      eventType: "tool_execution_update",
      timestamp: 1000,
      data: {
        toolCallId: "call-subagent",
        partialResult: {
          details: { agentId: "subagent-spec-1", state: "running", ...entries },
        },
      },
    };

    const prepared = prepareEventForReplay(event, { maxToolPayloadBytes: 20 * 1024 });
    const partialResult = prepared.event.data.partialResult as { details?: { agentId?: string; state?: string; truncated?: boolean } };
    expect(partialResult.details).toMatchObject({ agentId: "subagent-spec-1", state: "running", truncated: true });
    expect(new TextEncoder().encode(JSON.stringify(partialResult)).byteLength).toBeLessThanOrEqual(20 * 1024);
  });

  it("retains top-level object shape and content in bounded form when summarizing oversized payload", () => {
    const event: DashboardEvent = {
      eventType: "tool_execution_update",
      timestamp: 1000,
      data: {
        toolCallId: "call-content",
        partialResult: {
          details: { agentId: "subagent-spec-2", state: "running" },
          content: [{ type: "text", text: "z".repeat(50_000) }],
          extraLarge: "w".repeat(50_000),
        },
      },
    };

    const prepared = prepareEventForReplay(event, { maxToolPayloadBytes: 20 * 1024 });
    const partialResult = prepared.event.data.partialResult as {
      details?: { agentId?: string; state?: string };
      content?: Array<{ type?: string; text?: string }>;
    };
    expect(partialResult.details?.agentId).toBe("subagent-spec-2");
    expect(partialResult.details?.state).toBe("running");
    expect(Array.isArray(partialResult.content)).toBe(true);
    expect(partialResult.content?.[0]?.type).toBe("text");
    expect(partialResult.content?.[0]?.text?.startsWith("«")).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(partialResult)).byteLength).toBeLessThanOrEqual(20 * 1024);
  });

  it("keeps a user-turn boundary after capping tool payloads", () => {
    const events: SeqEvent<DashboardEvent>[] = [
      {
        seq: 1,
        event: {
          eventType: "message_start",
          timestamp: 100,
          data: { message: { role: "user", content: "Please run the task" } },
        },
      },
      {
        seq: 2,
        event: {
          eventType: "message_start",
          timestamp: 110,
          data: { message: { role: "assistant" } },
        },
      },
    ];

    let seq = 3;
    for (let tool = 1; tool <= 10; tool += 1) {
      const toolCallId = `call-${tool}`;
      for (let update = 0; update < 50; update += 1) {
        events.push({
          seq: seq++,
          event: { eventType: "tool_execution_update", timestamp: 100 + seq, data: { toolCallId, coalesced: true } },
        });
      }
      events.push({
        seq: seq++,
        event: {
          eventType: "tool_execution_update",
          timestamp: 100 + seq,
          data: { toolCallId, toolName: "bash", partialResult: "y".repeat(50_000) },
        },
      });
    }

    const window = selectNewestEventsByBudget(events, DEFAULT_TAIL_WINDOW_BYTES, {
      maxToolPayloadBytes: 20 * 1024,
    });

    expect(window.events).toHaveLength(512);
    expect(window.events[0]?.seq).toBe(1);
    expect(window.partialHead).toBe(false);
  });
});
