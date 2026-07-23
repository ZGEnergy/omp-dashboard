import { describe, expect, it } from "vitest";
import type { EvictedToolBurst } from "../event-reducer.js";
import { classifyExpand, reachedExpandTarget } from "../expand-evicted-burst.js";

function burst(fromSeq: number, toSeq: number = fromSeq + 3): EvictedToolBurst {
  return { fromSeq, toSeq, count: toSeq - fromSeq + 1 };
}

describe("classifyExpand", () => {
  it("treats fromSeq === ledgerMinSeq as interior (inclusive boundary)", () => {
    expect(classifyExpand(burst(100), 100)).toBe("interior");
  });

  it("treats fromSeq above ledgerMinSeq as interior", () => {
    expect(classifyExpand(burst(150), 100)).toBe("interior");
  });

  it("treats fromSeq === ledgerMinSeq - 1 as below-floor", () => {
    expect(classifyExpand(burst(99), 100)).toBe("below-floor");
  });

  it("treats a deep-below fromSeq as below-floor", () => {
    expect(classifyExpand(burst(10), 100)).toBe("below-floor");
  });
});

describe("reachedExpandTarget", () => {
  it("is true when ledgerMinSeq exactly equals the target", () => {
    expect(reachedExpandTarget(50, 50)).toBe(true);
  });

  it("is false when ledgerMinSeq is still above the target", () => {
    expect(reachedExpandTarget(60, 50)).toBe(false);
  });

  it("is true when ledgerMinSeq has dropped below the target", () => {
    expect(reachedExpandTarget(40, 50)).toBe(true);
  });
});
