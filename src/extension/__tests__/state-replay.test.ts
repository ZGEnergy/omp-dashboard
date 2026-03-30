import { describe, it, expect } from "vitest";
import { replayEntriesAsEvents } from "../../shared/state-replay.js";

describe("replayEntriesAsEvents", () => {
  it("should convert user message entry to message_start event", () => {
    const entries = [
      {
        type: "message",
        id: "e1",
        parentId: null,
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "Hello world" }],
        },
      },
    ];

    const events = replayEntriesAsEvents("sess-1", entries);
    expect(events).toHaveLength(1);
    expect(events[0].event.eventType).toBe("message_start");
    expect((events[0].event.data as any).message.role).toBe("user");
  });

  it("should convert assistant message entry to message_update + message_end events", () => {
    const entries = [
      {
        type: "message",
        id: "e1",
        parentId: null,
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hi there" }],
        },
      },
    ];

    const events = replayEntriesAsEvents("sess-1", entries);
    expect(events).toHaveLength(2);
    expect(events[0].event.eventType).toBe("message_update");
    expect(events[1].event.eventType).toBe("message_end");
  });

  it("should convert assistant tool calls to tool_execution_start events", () => {
    const entries = [
      {
        type: "message",
        id: "e1",
        parentId: null,
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "tc-1", name: "bash", arguments: '{"command":"ls"}' },
            { type: "text", text: "Let me check" },
          ],
        },
      },
    ];

    const events = replayEntriesAsEvents("sess-1", entries);
    // tool_execution_start + message_update + message_end + tool_execution_end (orphaned)
    expect(events).toHaveLength(4);
    expect(events[0].event.eventType).toBe("tool_execution_start");
    expect((events[0].event.data as any).toolName).toBe("bash");
    expect((events[0].event.data as any).args).toEqual({ command: "ls" });
    expect(events[3].event.eventType).toBe("tool_execution_end");
  });

  it("should convert tool result message to tool_execution_end", () => {
    // Real pi structure: toolCallId and toolName at message level
    const entries = [
      {
        type: "message",
        id: "e1",
        parentId: null,
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "bash",
          content: [{ type: "text", text: "file1.txt\nfile2.txt" }],
          isError: false,
        },
      },
    ];

    const events = replayEntriesAsEvents("sess-1", entries);
    expect(events).toHaveLength(1);
    expect(events[0].event.eventType).toBe("tool_execution_end");
    expect((events[0].event.data as any).toolCallId).toBe("tc-1");
    expect((events[0].event.data as any).toolName).toBe("bash");
    expect((events[0].event.data as any).result).toBe("file1.txt\nfile2.txt");
    expect((events[0].event.data as any).isError).toBe(false);
  });

  it("should return empty array for empty entries", () => {
    expect(replayEntriesAsEvents("sess-1", [])).toEqual([]);
  });

  it("should skip unknown entry types", () => {
    const entries = [
      { type: "custom", id: "e1", customType: "foo", data: {} },
      { type: "compaction", id: "e2", summary: "..." },
    ];
    expect(replayEntriesAsEvents("sess-1", entries)).toEqual([]);
  });

  it("should generate stats_update event from assistant message with usage data", () => {
    const entries = [
      {
        type: "message",
        id: "e1",
        parentId: null,
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
          usage: {
            input: 100,
            output: 50,
            cacheRead: 80,
            cacheWrite: 20,
            cost: { total: 0.005 },
          },
        },
      },
    ];

    const events = replayEntriesAsEvents("sess-1", entries);
    // message_update + message_end + stats_update
    expect(events).toHaveLength(3);
    expect(events[2].event.eventType).toBe("stats_update");
    const data = events[2].event.data as any;
    expect(data.tokensIn).toBe(100);
    expect(data.tokensOut).toBe(50);
    expect(data.cost).toBe(0.005);
    expect(data.turnUsage).toEqual({
      input: 100,
      output: 50,
      cacheRead: 80,
      cacheWrite: 20,
    });
  });

  it("should not generate stats_update when assistant message has no usage", () => {
    const entries = [
      {
        type: "message",
        id: "e1",
        parentId: null,
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
        },
      },
    ];

    const events = replayEntriesAsEvents("sess-1", entries);
    // Only message_update + message_end, no stats_update
    expect(events).toHaveLength(2);
    expect(events.every(e => e.event.eventType !== "stats_update")).toBe(true);
  });

  it("should emit tool_execution_end for orphaned tool calls (killed mid-execution)", () => {
    const entries = [
      {
        type: "message", id: "e1", parentId: null,
        timestamp: "2025-01-01T00:00:00Z",
        message: { role: "user", content: [{ type: "text", text: "Run something" }] },
      },
      {
        type: "message", id: "e2", parentId: "e1",
        timestamp: "2025-01-01T00:00:01Z",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "tc-1", name: "bash", arguments: '{"command":"sleep 100"}' },
          ],
        },
      },
      // No toolResult — agent was killed mid-execution
    ];

    const events = replayEntriesAsEvents("sess-1", entries);
    const types = events.map((e) => e.event.eventType);
    // Should auto-close the orphaned tool call
    expect(types).toContain("tool_execution_end");
    const endEvent = events.find(e => e.event.eventType === "tool_execution_end");
    expect((endEvent!.event.data as any).toolCallId).toBe("tc-1");
    expect((endEvent!.event.data as any).toolName).toBe("bash");
  });

  it("should handle a full conversation sequence", () => {
    const entries = [
      {
        type: "message", id: "e1", parentId: null,
        timestamp: "2025-01-01T00:00:00Z",
        message: { role: "user", content: [{ type: "text", text: "List files" }] },
      },
      {
        type: "message", id: "e2", parentId: "e1",
        timestamp: "2025-01-01T00:00:01Z",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "tc-1", name: "bash", arguments: '{"command":"ls"}' },
            { type: "text", text: "Running ls" },
          ],
        },
      },
      {
        type: "message", id: "e3", parentId: "e2",
        timestamp: "2025-01-01T00:00:02Z",
        message: {
          role: "toolResult",
          toolCallId: "tc-1",
          toolName: "bash",
          content: [{ type: "text", text: "a.txt" }],
          isError: false,
        },
      },
      {
        type: "message", id: "e4", parentId: "e3",
        timestamp: "2025-01-01T00:00:03Z",
        message: { role: "assistant", content: [{ type: "text", text: "Found a.txt" }] },
      },
    ];

    const events = replayEntriesAsEvents("sess-1", entries);
    const types = events.map((e) => e.event.eventType);
    expect(types).toEqual([
      "message_start",        // user message
      "tool_execution_start", // tool call from assistant
      "message_update",       // assistant message (streaming)
      "message_end",          // assistant message (finalize)
      "tool_execution_end",   // tool result
      "message_update",       // final assistant message (streaming)
      "message_end",          // final assistant message (finalize)
    ]);
  });
});
