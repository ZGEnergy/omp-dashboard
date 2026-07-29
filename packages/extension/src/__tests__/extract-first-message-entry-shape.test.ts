/**
 * Regression test for `extractFirstMessage` against pi's REAL `SessionEntry`
 * shape.
 *
 * `SessionManager.getEntries()` returns ENVELOPES — `{ type: "message",
 * message: { role, content } }` — not bare messages. The original
 * implementation tested `entry.role`, which no `SessionEntry` variant carries,
 * so it returned `undefined` for every real session and the fork content
 * predicate was inert in production (issue #107 follow-up).
 *
 * These fixtures use the envelope shape declared by
 * `@earendil-works/pi-coding-agent`'s `SessionMessageEntry`, and they import
 * the REAL function — never a copy.
 *
 * See change: fork-content-predicate.
 */
import { describe, expect, it } from "vitest";
import { extractFirstMessage } from "../bridge-context.js";

/** Build a ctx whose sessionManager returns the given pi-shaped entries. */
function ctxWithEntries(entries: unknown[]): any {
  return { sessionManager: { getEntries: () => entries } };
}

const modelChange = { id: "e1", type: "model_change", model: { provider: "anthropic", id: "opus" } };
const thinkingChange = { id: "e2", type: "thinking_level_change", level: "medium" };

describe("extractFirstMessage — pi SessionEntry envelope shape", () => {
  it("extracts the first user message from a message envelope with string content", () => {
    const ctx = ctxWithEntries([
      modelChange,
      { id: "e3", type: "message", message: { role: "user", content: "fix the fork bug" } },
      { id: "e4", type: "message", message: { role: "assistant", content: "on it" } },
    ]);
    expect(extractFirstMessage(ctx)).toBe("fix the fork bug");
  });

  it("extracts the first text block from TextContent[] content", () => {
    const ctx = ctxWithEntries([
      {
        id: "e3",
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "text", text: "look at this image and fix the bug" },
            { type: "image", data: "base64...", mimeType: "image/png" },
          ],
        },
      },
    ]);
    expect(extractFirstMessage(ctx)).toBe("look at this image and fix the bug");
  });

  it("skips a leading image-only block and takes the first text block", () => {
    const ctx = ctxWithEntries([
      {
        id: "e3",
        type: "message",
        message: {
          role: "user",
          content: [
            { type: "image", data: "base64...", mimeType: "image/png" },
            { type: "text", text: "what is wrong here" },
          ],
        },
      },
    ]);
    expect(extractFirstMessage(ctx)).toBe("what is wrong here");
  });

  it("truncates to 200 chars", () => {
    const ctx = ctxWithEntries([
      { id: "e3", type: "message", message: { role: "user", content: "a".repeat(300) } },
    ]);
    expect(extractFirstMessage(ctx)).toBe("a".repeat(200));
  });

  it("ignores assistant messages before the first user message", () => {
    const ctx = ctxWithEntries([
      { id: "e3", type: "message", message: { role: "assistant", content: "hello" } },
      { id: "e4", type: "message", message: { role: "user", content: "hi there" } },
    ]);
    expect(extractFirstMessage(ctx)).toBe("hi there");
  });

  it("returns undefined for a freshly-spawned session (model/thinking entries only)", () => {
    // The degrade contract: a fresh session must NOT look forkable.
    // See change: fix-fork-empty-session-silent-timeout.
    expect(extractFirstMessage(ctxWithEntries([modelChange, thinkingChange]))).toBeUndefined();
  });

  it("returns undefined for no entries", () => {
    expect(extractFirstMessage(ctxWithEntries([]))).toBeUndefined();
  });

  it("returns undefined when getEntries is unavailable", () => {
    expect(extractFirstMessage({ sessionManager: {} })).toBeUndefined();
    expect(extractFirstMessage({})).toBeUndefined();
    expect(extractFirstMessage(undefined)).toBeUndefined();
  });

  it("returns undefined when getEntries throws", () => {
    const ctx = { sessionManager: { getEntries: () => { throw new Error("fail"); } } };
    expect(extractFirstMessage(ctx)).toBeUndefined();
  });

  it("returns undefined when the user message has no text block", () => {
    const ctx = ctxWithEntries([
      {
        id: "e3",
        type: "message",
        message: { role: "user", content: [{ type: "image", data: "b64", mimeType: "image/png" }] },
      },
    ]);
    expect(extractFirstMessage(ctx)).toBeUndefined();
  });
});
