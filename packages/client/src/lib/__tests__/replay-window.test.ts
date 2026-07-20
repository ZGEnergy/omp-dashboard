import { describe, expect, it } from "vitest";
import { mergeReplayWindow } from "../replay-window.js";

describe("mergeReplayWindow", () => {
  it("keeps a cache-seeded older window when a delta terminal reports only its own range", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true, partialHead: true }, { kind: "delta", minSeq: 120, hasMoreOlder: false, partialHead: false }, 120),
    ).toEqual({ minSeq: 50, hasMoreOlder: true, partialHead: true });
  });

  it("preserves the established partial-head marker on delta frames", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true, partialHead: true }, { kind: "delta", minSeq: 120, hasMoreOlder: false, partialHead: false }, 120),
    ).toEqual({ minSeq: 50, hasMoreOlder: true, partialHead: true });
  });

  it("uses a cold frame's zero cursor and replaces its partial-head marker", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true, partialHead: false }, { kind: "cold", minSeq: 0, hasMoreOlder: true, partialHead: true }, 0),
    ).toEqual({ minSeq: 0, hasMoreOlder: true, partialHead: true });
  });

  it("adopts an older page's supplied partial-head marker", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true, partialHead: true }, { kind: "older", minSeq: 30, hasMoreOlder: true, partialHead: false }, 30),
    ).toEqual({ minSeq: 30, hasMoreOlder: true, partialHead: false });
  });

  it("uses the delta range when no older window exists", () => {
    expect(
      mergeReplayWindow(undefined, { kind: "delta", minSeq: 7, hasMoreOlder: false, partialHead: false }, 7),
    ).toEqual({ minSeq: 7, hasMoreOlder: false, partialHead: false });
  });

  it("replaces the window on a cold baseline", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true, partialHead: false }, { kind: "cold", minSeq: 90, hasMoreOlder: false, partialHead: true }, 90),
    ).toEqual({ minSeq: 90, hasMoreOlder: false, partialHead: true });
  });

  it("advances the older window downward on older pages", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true, partialHead: true }, { kind: "older", minSeq: 30, hasMoreOlder: true, partialHead: false }, 30),
    ).toEqual({ minSeq: 30, hasMoreOlder: true, partialHead: false });
  });

  it("clears hasMoreOlder when the oldest page arrives", () => {
    expect(
      mergeReplayWindow({ minSeq: 30, hasMoreOlder: true, partialHead: true }, { kind: "older", minSeq: 1, hasMoreOlder: false, partialHead: false }, 1),
    ).toEqual({ minSeq: 1, hasMoreOlder: false, partialHead: false });
  });

  it("returns null when the frame carries no window metadata", () => {
    expect(
      mergeReplayWindow({ minSeq: 50, hasMoreOlder: true, partialHead: true }, { kind: "delta", minSeq: null, hasMoreOlder: null, partialHead: null }, 120),
    ).toBeNull();
  });

  it("infers more history for legacy cold frames that omit metadata", () => {
    expect(
      mergeReplayWindow(undefined, { kind: "cold", minSeq: null, hasMoreOlder: null, partialHead: null }, 90),
    ).toEqual({ minSeq: 90, hasMoreOlder: true, partialHead: false });
  });
});
