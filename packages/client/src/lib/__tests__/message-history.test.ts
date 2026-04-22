import { describe, it, expect } from "vitest";
import { extractUserPromptHistory } from "../message-history.js";
import type { ChatMessage } from "../event-reducer.js";

function userMsg(id: string, content: string, timestamp = 0): ChatMessage {
  return { id, role: "user", content, timestamp };
}

function assistantMsg(id: string, content: string, timestamp = 0): ChatMessage {
  return { id, role: "assistant", content, timestamp };
}

function toolMsg(id: string, timestamp = 0): ChatMessage {
  return {
    id,
    role: "toolResult",
    content: "",
    toolName: "bash",
    timestamp,
  };
}

describe("extractUserPromptHistory", () => {
  it("returns an empty array for an empty input", () => {
    expect(extractUserPromptHistory([])).toEqual([]);
  });

  it("returns only user messages", () => {
    const msgs: ChatMessage[] = [
      assistantMsg("a1", "hi"),
      userMsg("u1", "first"),
      assistantMsg("a2", "ok"),
      toolMsg("t1"),
      userMsg("u2", "second"),
    ];
    expect(extractUserPromptHistory(msgs)).toEqual(["second", "first"]);
  });

  it("returns newest-first (reverse chronological)", () => {
    const msgs: ChatMessage[] = [
      userMsg("u1", "oldest", 1),
      userMsg("u2", "middle", 2),
      userMsg("u3", "newest", 3),
    ];
    expect(extractUserPromptHistory(msgs)).toEqual(["newest", "middle", "oldest"]);
  });

  it("collapses consecutive duplicates", () => {
    const msgs: ChatMessage[] = [
      userMsg("u1", "ping"),
      userMsg("u2", "ping"),
      userMsg("u3", "ping"),
      userMsg("u4", "pong"),
    ];
    expect(extractUserPromptHistory(msgs)).toEqual(["pong", "ping"]);
  });

  it("preserves non-consecutive duplicates", () => {
    const msgs: ChatMessage[] = [
      userMsg("u1", "ping"),
      userMsg("u2", "pong"),
      userMsg("u3", "ping"),
    ];
    // Newest-first: "ping", "pong", "ping"
    expect(extractUserPromptHistory(msgs)).toEqual(["ping", "pong", "ping"]);
  });

  it("skips empty and whitespace-only contents", () => {
    const msgs: ChatMessage[] = [
      userMsg("u1", "real prompt"),
      userMsg("u2", ""),
      userMsg("u3", "   "),
      userMsg("u4", "\n\t"),
      userMsg("u5", "another"),
    ];
    expect(extractUserPromptHistory(msgs)).toEqual(["another", "real prompt"]);
  });

  it("handles a single user message", () => {
    expect(extractUserPromptHistory([userMsg("u1", "hello")])).toEqual(["hello"]);
  });

  it("includes slash-commands and bang-shell lines verbatim", () => {
    const msgs: ChatMessage[] = [
      userMsg("u1", "/compact"),
      userMsg("u2", "!ls -la"),
      userMsg("u3", "fix the bug"),
    ];
    expect(extractUserPromptHistory(msgs)).toEqual(["fix the bug", "!ls -la", "/compact"]);
  });
});
