import { describe, it, expect } from "vitest";
import { buildOpenSpecData } from "../openspec-poller.js";

describe("buildOpenSpecData - isComplete pass-through", () => {
  const listResult = {
    changes: [
      { name: "a", status: "in-progress", completedTasks: 1, totalTasks: 3 },
      { name: "b", status: "in-progress", completedTasks: 0, totalTasks: 5 },
      { name: "c", status: "complete", completedTasks: 2, totalTasks: 2 },
    ],
  };

  it("passes isComplete=true through", () => {
    const statusResults = new Map<string, any>([
      ["a", { artifacts: [{ id: "proposal", status: "done" }], isComplete: true }],
      ["b", null],
      ["c", null],
    ]);
    const data = buildOpenSpecData(listResult, statusResults);
    const a = data.changes.find((c) => c.name === "a")!;
    expect(a.isComplete).toBe(true);
  });

  it("passes isComplete=false through", () => {
    const statusResults = new Map<string, any>([
      ["a", { artifacts: [], isComplete: false }],
      ["b", null],
      ["c", null],
    ]);
    const data = buildOpenSpecData(listResult, statusResults);
    expect(data.changes.find((c) => c.name === "a")!.isComplete).toBe(false);
  });

  it("leaves isComplete undefined when absent from status result", () => {
    const statusResults = new Map<string, any>([
      ["a", { artifacts: [] }],
      ["b", null],
      ["c", null],
    ]);
    const data = buildOpenSpecData(listResult, statusResults);
    expect("isComplete" in data.changes.find((c) => c.name === "a")!).toBe(false);
    expect(data.changes.find((c) => c.name === "b")!.isComplete).toBeUndefined();
  });
});
