import { describe, it, expect } from "vitest";
import {
  buildColdTailSubscribe,
  buildLoadOlderSubscribe,
  buildSessionSubscribe,
} from "../session-subscribe.js";

describe("buildSessionSubscribe", () => {
  it("cold lastSeq 0 sends mode:tail", () => {
    expect(buildSessionSubscribe("s1", 0)).toEqual({
      type: "subscribe",
      sessionId: "s1",
      lastSeq: 0,
      mode: "tail",
    });
  });

  it("delta lastSeq>0 omits mode", () => {
    expect(buildSessionSubscribe("s1", 42)).toEqual({
      type: "subscribe",
      sessionId: "s1",
      lastSeq: 42,
    });
  });

  it("buildColdTailSubscribe always requests tail", () => {
    expect(buildColdTailSubscribe("abc")).toEqual({
      type: "subscribe",
      sessionId: "abc",
      lastSeq: 0,
      mode: "tail",
    });
  });

  it("buildLoadOlderSubscribe uses fromSeq exclusive upper bound", () => {
    expect(buildLoadOlderSubscribe("s1", 100)).toEqual({
      type: "subscribe",
      sessionId: "s1",
      fromSeq: 100,
    });
  });
});
