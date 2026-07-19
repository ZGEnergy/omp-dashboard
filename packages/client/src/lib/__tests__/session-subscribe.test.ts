import { describe, expect, it } from "vitest";
import {
  buildColdTailSubscribe,
  buildLoadOlderSubscribe,
  buildSessionSubscribe,
} from "../session-subscribe.js";

describe("buildSessionSubscribe", () => {
  it("mints unique request ids and sends source generation with cold/delta/older requests", () => {
    const cold = buildSessionSubscribe("s1", 0, "source-a");
    const delta = buildSessionSubscribe("s1", 42, "source-a");
    const older = buildLoadOlderSubscribe("s1", 100, "source-a");
    expect(cold).toMatchObject({ type: "subscribe", sessionId: "s1", lastSeq: 0, mode: "tail", knownSourceGeneration: "source-a" });
    expect(delta).toMatchObject({ type: "subscribe", sessionId: "s1", lastSeq: 42, knownSourceGeneration: "source-a" });
    expect(older).toMatchObject({ type: "subscribe", sessionId: "s1", fromSeq: 100, knownSourceGeneration: "source-a" });
    expect(new Set([cold.requestId, delta.requestId, older.requestId]).size).toBe(3);
  });

  it("buildColdTailSubscribe always requests tail", () => {
    const message = buildColdTailSubscribe("abc");
    expect(message).toMatchObject({ type: "subscribe", sessionId: "abc", lastSeq: 0, mode: "tail" });
    expect(message.requestId).toEqual(expect.any(String));
  });
});
