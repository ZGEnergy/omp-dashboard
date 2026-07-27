import { describe, expect, it } from "vitest";
import { prepareEventForReplay, utf8ByteLength } from "../prepare-event-for-replay.js";
import type { DashboardEvent } from "../types.js";

describe("event-window tool coalescing and agent field metadata preservation", () => {
  it("bounds an oversized args payload with an empty terminal result, keeping event data <= 20 KiB and preserving useful args", () => {
    const hugeContent = "X".repeat(50 * 1024); // 50 KiB string in args
    const rawEvent: DashboardEvent = {
      eventType: "tool_execution_end",
      timestamp: 1700000000000,
      data: {
        toolCallId: "call_write_file_001",
        toolName: "write",
        args: {
          path: "src/large_file.ts",
          content: hugeContent,
          mode: "overwrite",
        },
        result: {},
      },
    };

    const capBytes = 20 * 1024; // 20 KiB limit
    const prepared = prepareEventForReplay(rawEvent, {
      maxEventBytes: capBytes,
      maxTextBytes: capBytes,
    });

    const serializedDataBytes = utf8ByteLength(JSON.stringify(prepared.event.data));
    const serializedTotalBytes = utf8ByteLength(JSON.stringify(prepared.event));

    // Must satisfy total event data <= 20 KiB cap
    expect(serializedDataBytes).toBeLessThanOrEqual(capBytes);
    expect(serializedTotalBytes).toBeLessThanOrEqual(capBytes);

    // Data must not be wiped out to fallback
    expect(prepared.event.data).not.toHaveProperty("replayUnavailable");

    const data = prepared.event.data as Record<string, unknown>;
    const args = data.args as Record<string, unknown>;
    expect(data.toolCallId).toBe("call_write_file_001");
    expect(data.toolName).toBe("write");
    expect(data.result).toEqual({});

    // Useful bounded args must remain intact
    expect(data.args).toBeDefined();
    expect(args.path).toBe("src/large_file.ts");
    expect(args.mode).toBe("overwrite");
    expect(typeof args.content).toBe("string");
    expect((args.content as string).length).toBeLessThan(hugeContent.length);
  });

  it("preserves every Agent field rendered as visible status/stat/error metadata when summarization truncates oversized details", () => {
    const hugeDetailsPayload = "D".repeat(80 * 1024); // 80 KiB oversized details payload
    const agentArgs = {
      description: "Running subagent task for background execution",
      toolUses: 14,
      tokens: "8.4k",
      turnCount: 6,
      maxTurns: 15,
      durationMs: 42000,
      tags: ["subagent", "background-worker"],
      error: "Subagent process failed with exit code 1",
      details: {
        tokensUsage: { inputTokens: 1200, outputTokens: 450, totalTokens: 1650 },
        agentMdPath: "/path/to/agent.md",
        hugeLogs: hugeDetailsPayload,
      },
    };

    const rawEvent: DashboardEvent = {
      eventType: "tool_execution_end",
      timestamp: 1700000001000,
      data: {
        toolCallId: "call_agent_subtask_999",
        toolName: "Agent",
        args: agentArgs,
        result: {},
      },
    };

    const capBytes = 20 * 1024; // 20 KiB cap
    const prepared = prepareEventForReplay(rawEvent, {
      maxEventBytes: capBytes,
      maxTextBytes: capBytes,
      maxToolPayloadBytes: capBytes,
    });

    const serializedDataBytes = utf8ByteLength(JSON.stringify(prepared.event.data));
    expect(serializedDataBytes).toBeLessThanOrEqual(capBytes);

    // Verify event data is preserved (not replaced with replayUnavailable)
    expect(prepared.event.data).not.toHaveProperty("replayUnavailable");

    const data = prepared.event.data as Record<string, unknown>;
    expect(data.args).toBeDefined();
    const args = data.args as Record<string, unknown>;

    // Verify every single visible Agent metadata field survives:
    expect(args.description).toBe("Running subagent task for background execution");
    expect(args.toolUses).toBe(14);
    expect(args.tokens).toBe("8.4k");
    expect(args.turnCount).toBe(6);
    expect(args.maxTurns).toBe(15);
    expect(args.durationMs).toBe(42000);
    expect(args.tags).toEqual(["subagent", "background-worker"]);
    expect(args.error).toBe("Subagent process failed with exit code 1");

    // Verify details metadata fields survive tool payload capping
    expect(args.details).toBeDefined();
    const details = args.details as Record<string, unknown>;
    expect(details.tokensUsage).toEqual({ inputTokens: 1200, outputTokens: 450, totalTokens: 1650 });
    expect(details.agentMdPath).toBe("/path/to/agent.md");

    // Oversized details payload was truncated/summarized
    expect(utf8ByteLength(JSON.stringify(args.details))).toBeLessThan(utf8ByteLength(hugeDetailsPayload));
  });
});
