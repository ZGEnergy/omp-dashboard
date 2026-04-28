/**
 * Verifies `buildOpenSpecData`'s specs-artifact override behavior.
 * Invariants: promote-only, specs-only, never demote, isComplete only
 * promoted to true (never demoted from CLI true), no-factory call site
 * is verbatim back-compat.
 *
 * See change: fix-openspec-specs-mtime-gate-blind-spot.
 */
import { describe, expect, it } from "vitest";
import { buildOpenSpecData } from "../openspec-poller.js";
import type { SpecsEvidenceProbe } from "../openspec-specs-evidence.js";

function specsProbe(satisfied: boolean, calls?: { count: number }): SpecsEvidenceProbe {
  return {
    hasAnySpecFile: () => {
      if (calls) calls.count++;
      return satisfied;
    },
  };
}

const listResult = {
  changes: [
    { name: "x", status: "in-progress", completedTasks: 1, totalTasks: 3 },
  ],
};

describe("buildOpenSpecData specs override", () => {
  it("promotes specs ready→done when probe satisfies", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [
            { id: "proposal", status: "done" },
            { id: "design", status: "done" },
            { id: "specs", status: "ready" },
            { id: "tasks", status: "ready" },
          ],
          isComplete: false,
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      undefined, // no design probe
      () => specsProbe(true),
    );
    const x = data.changes[0];
    expect(x.artifacts.find((a) => a.id === "specs")!.status).toBe("done");
  });

  it("does NOT promote when probe says not satisfied", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [{ id: "specs", status: "ready" }],
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      undefined,
      () => specsProbe(false),
    );
    expect(data.changes[0].artifacts.find((a) => a.id === "specs")!.status).toBe("ready");
  });

  it("never promotes blocked → done", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [{ id: "specs", status: "blocked" }],
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      undefined,
      () => specsProbe(true),
    );
    expect(data.changes[0].artifacts.find((a) => a.id === "specs")!.status).toBe("blocked");
  });

  it("never demotes done → ready (CLI says done; we trust it)", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [{ id: "specs", status: "done" }],
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      undefined,
      () => specsProbe(false),
    );
    expect(data.changes[0].artifacts.find((a) => a.id === "specs")!.status).toBe("done");
  });

  it("only mutates specs — other artifact statuses pass through", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [
            { id: "proposal", status: "ready" },
            { id: "design", status: "blocked" },
            { id: "specs", status: "ready" },
            { id: "tasks", status: "ready" },
          ],
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      undefined,
      () => specsProbe(true),
    );
    const arts = data.changes[0].artifacts;
    expect(arts.find((a) => a.id === "proposal")!.status).toBe("ready");
    expect(arts.find((a) => a.id === "design")!.status).toBe("blocked");
    expect(arts.find((a) => a.id === "specs")!.status).toBe("done");
    expect(arts.find((a) => a.id === "tasks")!.status).toBe("ready");
  });

  it("re-derives isComplete=true when all artifacts done after override", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [
            { id: "proposal", status: "done" },
            { id: "design", status: "done" },
            { id: "specs", status: "ready" },
            { id: "tasks", status: "done" },
          ],
          isComplete: false,
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      undefined,
      () => specsProbe(true),
    );
    expect(data.changes[0].isComplete).toBe(true);
  });

  it("does NOT promote isComplete when any non-specs artifact is not done", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [
            { id: "proposal", status: "done" },
            { id: "design", status: "ready" },
            { id: "specs", status: "ready" },
            { id: "tasks", status: "blocked" },
          ],
          isComplete: false,
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      undefined,
      () => specsProbe(true),
    );
    expect(data.changes[0].isComplete).toBe(false);
  });

  it("never demotes CLI isComplete=true to false", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [{ id: "specs", status: "ready" }],
          isComplete: true,
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      undefined,
      () => specsProbe(false),
    );
    expect(data.changes[0].isComplete).toBe(true);
  });

  it("no-factory call site preserves today's behavior verbatim", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [
            { id: "specs", status: "ready" },
            { id: "tasks", status: "blocked" },
          ],
          isComplete: false,
        },
      ],
    ]);
    // Both probe params omitted — must match pre-change behavior verbatim.
    const data = buildOpenSpecData(listResult, statusResults);
    expect(data.changes[0].artifacts.find((a) => a.id === "specs")!.status).toBe("ready");
    expect(data.changes[0].isComplete).toBe(false);
  });

  it("specs probe factory receives the change name", () => {
    const seen: string[] = [];
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [{ id: "specs", status: "ready" }],
        },
      ],
    ]);
    buildOpenSpecData(listResult, statusResults, undefined, (changeName) => {
      seen.push(changeName);
      return specsProbe(false);
    });
    expect(seen).toContain("x");
  });

  it("specs probe is NOT consulted when CLI says specs is already done", () => {
    const calls = { count: 0 };
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [{ id: "specs", status: "done" }],
        },
      ],
    ]);
    buildOpenSpecData(listResult, statusResults, undefined, () => specsProbe(true, calls));
    expect(calls.count).toBe(0);
  });

  it("design and specs overrides compose: both ready, both promoted, isComplete becomes true", () => {
    const statusResults = new Map<string, any>([
      [
        "x",
        {
          artifacts: [
            { id: "proposal", status: "done" },
            { id: "design", status: "ready" },
            { id: "specs", status: "ready" },
            { id: "tasks", status: "done" },
          ],
          isComplete: false,
        },
      ],
    ]);
    const data = buildOpenSpecData(
      listResult,
      statusResults,
      // Design probe satisfies.
      () => ({
        hasDesignFile: () => true,
        hasDesignDirWithMd: () => false,
        tasksHasCheckboxes: () => false,
      }),
      // Specs probe satisfies.
      () => specsProbe(true),
    );
    const arts = data.changes[0].artifacts;
    expect(arts.find((a) => a.id === "design")!.status).toBe("done");
    expect(arts.find((a) => a.id === "specs")!.status).toBe("done");
    expect(data.changes[0].isComplete).toBe(true);
  });
});
