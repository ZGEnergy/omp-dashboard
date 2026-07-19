import { describe, expect, it } from "vitest";
import { mergeReplayWindow } from "../replay-window.js";

describe("mergeReplayWindow", () => {
  it("keeps a cache-seeded older window when a delta terminal reports only its own range", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true }, { kind: "delta", minSeq: 120, hasMoreOlder: false }, 120),
    ).toEqual({ minSeq: 50, hasMoreOlder: true });
  });

  it("uses the delta range when no older window exists", () => {
    expect(
      mergeReplayWindow(undefined, { kind: "delta", minSeq: 7, hasMoreOlder: false }, 7),
    ).toEqual({ minSeq: 7, hasMoreOlder: false });
  });

  it("replaces the window on a cold baseline", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true }, { kind: "cold", minSeq: 90, hasMoreOlder: false }, 90),
    ).toEqual({ minSeq: 90, hasMoreOlder: false });
  });

  it("advances the older window downward on older pages", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true }, { kind: "older", minSeq: 30, hasMoreOlder: true }, 30),
    ).toEqual({ minSeq: 30, hasMoreOlder: true });
  });

  it("clears hasMoreOlder when the oldest page arrives", () => {
    expect(
      mergeReplayWindow({ minSeq: 30, hasMoreOlder: true }, { kind: "older", minSeq: 1, hasMoreOlder: false }, 1),
    ).toEqual({ minSeq: 1, hasMoreOlder: false });
  });

  it("returns null when the frame carries no window metadata", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true }, { kind: "delta", minSeq: null, hasMoreOlder: null }, 120),
    ).toBeNull();
  });

  it("infers more history for legacy cold frames that omit metadata", () => {
    expect(
      mergeReplayWindow(undefined, { kind: "cold", minSeq: null, hasMoreOlder: null }, 90),
    ).toEqual({ minSeq: 90, hasMoreOlder: true });
  });
});
