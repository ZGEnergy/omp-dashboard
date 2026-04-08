import { describe, it, expect } from "vitest";
import { groupConsecutiveToolCalls, type ChatItem, type ToolCallGroup } from "../group-tool-calls.js";
import type { ChatMessage } from "../event-reducer.js";

function toolMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `msg-${Math.random()}`,
    role: "toolResult",
    content: "",
    toolName: "bash",
    toolCallId: "tc-1",
    toolStatus: "complete",
    timestamp: Date.now(),
    args: { command: "curl -s http://localhost:8000/api/health" },
    ...overrides,
  };
}

function userMsg(): ChatMessage {
  return { id: `msg-${Math.random()}`, role: "user", content: "hello", timestamp: Date.now() };
}

function isGroup(item: ChatItem): item is ToolCallGroup {
  return (item as any).type === "group";
}

describe("groupConsecutiveToolCalls", () => {
  it("groups 3+ consecutive identical tool calls", () => {
    const msgs = [toolMsg(), toolMsg(), toolMsg()];
    const result = groupConsecutiveToolCalls(msgs);
    expect(result).toHaveLength(1);
    expect(isGroup(result[0])).toBe(true);
    expect((result[0] as ToolCallGroup).messages).toHaveLength(3);
  });

  it("does not group fewer than 3 identical calls", () => {
    const msgs = [toolMsg(), toolMsg()];
    const result = groupConsecutiveToolCalls(msgs);
    expect(result).toHaveLength(2);
    expect(isGroup(result[0])).toBe(false);
  });

  it("does not group different tool names", () => {
    const msgs = [
      toolMsg({ toolName: "bash" }),
      toolMsg({ toolName: "read" }),
      toolMsg({ toolName: "bash" }),
    ];
    const result = groupConsecutiveToolCalls(msgs);
    expect(result).toHaveLength(3);
    expect(result.every((r) => !isGroup(r))).toBe(true);
  });

  it("does not group different args", () => {
    const msgs = [
      toolMsg({ args: { command: "echo 1" } }),
      toolMsg({ args: { command: "echo 2" } }),
      toolMsg({ args: { command: "echo 3" } }),
    ];
    const result = groupConsecutiveToolCalls(msgs);
    expect(result).toHaveLength(3);
  });

  it("does not include a running last item in the group", () => {
    const msgs = [toolMsg(), toolMsg(), toolMsg(), toolMsg({ toolStatus: "running" })];
    const result = groupConsecutiveToolCalls(msgs);
    // First 3 grouped, running one separate
    expect(result).toHaveLength(2);
    expect(isGroup(result[0])).toBe(true);
    expect((result[0] as ToolCallGroup).messages).toHaveLength(3);
    expect(isGroup(result[1])).toBe(false);
  });

  it("preserves non-tool messages between groups", () => {
    const msgs = [toolMsg(), toolMsg(), toolMsg(), userMsg(), toolMsg(), toolMsg(), toolMsg()];
    const result = groupConsecutiveToolCalls(msgs);
    expect(result).toHaveLength(3); // group, user, group
    expect(isGroup(result[0])).toBe(true);
    expect((result[1] as ChatMessage).role).toBe("user");
    expect(isGroup(result[2])).toBe(true);
  });

  it("handles empty array", () => {
    expect(groupConsecutiveToolCalls([])).toEqual([]);
  });

  it("handles single tool call", () => {
    const result = groupConsecutiveToolCalls([toolMsg()]);
    expect(result).toHaveLength(1);
    expect(isGroup(result[0])).toBe(false);
  });
});
