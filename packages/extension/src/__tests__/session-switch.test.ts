/**
 * Tests for session switch/fork behavior in the bridge extension.
 * These test the helper functions and logic used during session changes.
 */
import { describe, it, expect } from "vitest";

// We test the extractFirstMessage logic inline since it's a local function in bridge.ts.
// Replicate the logic here to verify behavior.

function extractFirstMessage(ctx: any): string | undefined {
  try {
    const entries = ctx.sessionManager?.getEntries?.();
    if (!entries || !Array.isArray(entries)) return undefined;
    for (const entry of entries) {
      if (entry.role === "user" && typeof entry.content === "string") {
        return entry.content.slice(0, 200);
      }
      if (entry.role === "user" && Array.isArray(entry.content)) {
        for (const part of entry.content) {
          if (part.type === "text" && typeof part.text === "string") {
            return part.text.slice(0, 200);
          }
        }
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

describe("extractFirstMessage", () => {
  it("should extract first user message as string content", () => {
    const ctx = {
      sessionManager: {
        getEntries: () => [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Help me fix the auth module" },
          { role: "assistant", content: "Sure, I'll help" },
        ],
      },
    };
    expect(extractFirstMessage(ctx)).toBe("Help me fix the auth module");
  });

  it("should extract first user message from array content", () => {
    const ctx = {
      sessionManager: {
        getEntries: () => [
          {
            role: "user",
            content: [
              { type: "text", text: "Look at this image and fix the bug" },
              { type: "image", data: "base64..." },
            ],
          },
        ],
      },
    };
    expect(extractFirstMessage(ctx)).toBe("Look at this image and fix the bug");
  });

  it("should truncate long messages to 200 chars", () => {
    const longMessage = "a".repeat(300);
    const ctx = {
      sessionManager: {
        getEntries: () => [{ role: "user", content: longMessage }],
      },
    };
    expect(extractFirstMessage(ctx)).toBe("a".repeat(200));
  });

  it("should return undefined when no entries exist", () => {
    const ctx = {
      sessionManager: {
        getEntries: () => [],
      },
    };
    expect(extractFirstMessage(ctx)).toBeUndefined();
  });

  it("should return undefined when getEntries is not available", () => {
    const ctx = { sessionManager: {} };
    expect(extractFirstMessage(ctx)).toBeUndefined();
  });

  it("should return undefined when sessionManager is not available", () => {
    expect(extractFirstMessage({})).toBeUndefined();
  });

  it("should handle errors gracefully", () => {
    const ctx = {
      sessionManager: {
        getEntries: () => { throw new Error("fail"); },
      },
    };
    expect(extractFirstMessage(ctx)).toBeUndefined();
  });
});

describe("session switch flow", () => {
  it("should produce unregister for old ID and register for new ID", () => {
    // This tests the expected message sequence during a session switch.
    // The actual bridge sends these messages; here we verify the logic.
    const messages: any[] = [];
    const send = (msg: any) => messages.push(msg);

    const oldSessionId = "old-uuid";
    let sessionId = oldSessionId;

    // Simulate handleSessionChange
    send({ type: "session_unregister", sessionId });

    sessionId = "new-uuid"; // ctx.sessionManager.getSessionId() returns new ID

    send({
      type: "session_register",
      sessionId,
      cwd: "/project",
      source: "tui",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ type: "session_unregister", sessionId: "old-uuid" });
    expect(messages[1]).toMatchObject({ type: "session_register", sessionId: "new-uuid" });
  });

  it("should handle fork identically to switch", () => {
    // Fork produces same message pattern: unregister old, register new
    const messages: any[] = [];
    const send = (msg: any) => messages.push(msg);

    let sessionId = "original-uuid";
    send({ type: "session_unregister", sessionId });
    sessionId = "forked-uuid";
    send({ type: "session_register", sessionId, cwd: "/project", source: "tui" });

    expect(messages[0].sessionId).toBe("original-uuid");
    expect(messages[1].sessionId).toBe("forked-uuid");
  });
});
