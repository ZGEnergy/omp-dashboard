import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SpawnSyncReturns } from "node:child_process";

// We need to mock spawnSync before importing the module under test
const mockSpawnSync = vi.fn<(...args: any[]) => any>();
const mockExecFile = vi.fn<(...args: any[]) => any>();
vi.mock("node:child_process", () => ({
  spawnSync: mockSpawnSync,
  execFile: mockExecFile,
  // re-export defaults that node:child_process has
  default: { spawnSync: mockSpawnSync, execFile: mockExecFile },
}));

// Import after mock is set up
const { pollOpenSpec } = await import("@blackbelt-technology/pi-dashboard-shared/openspec-poller.js");

function ok(data: unknown): Partial<SpawnSyncReturns<string>> {
  return { status: 0, stdout: JSON.stringify(data), stderr: "" };
}

function fail(): Partial<SpawnSyncReturns<string>> {
  return { status: 1, stdout: "", stderr: "error" };
}

function mockCli(responses: Map<string, unknown>) {
  mockSpawnSync.mockImplementation((_cmd: any, args: any) => {
    const a = args as string[];
    if (a.includes("list")) {
      const d = responses.get("list");
      return d ? ok(d) : fail();
    }
    if (a.includes("status")) {
      const idx = a.indexOf("--change");
      const name = idx >= 0 ? a[idx + 1] : "";
      const d = responses.get(`status:${name}`);
      return d ? ok(d) : fail();
    }
    return fail();
  });
}

beforeEach(() => {
  mockSpawnSync.mockReset();
});

describe("pollOpenSpec", () => {
  it("returns initialized=false when CLI throws", () => {
    mockSpawnSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const result = pollOpenSpec("/project");
    expect(result).toEqual({ initialized: false, changes: [] });
  });

  it("returns initialized=false when list returns non-zero exit", () => {
    mockSpawnSync.mockReturnValue(fail());
    const result = pollOpenSpec("/project");
    expect(result).toEqual({ initialized: false, changes: [] });
  });

  it("returns initialized=true with changes on success", () => {
    mockCli(new Map([
      ["list", {
        changes: [
          { name: "feat-a", status: "in-progress", completedTasks: 3, totalTasks: 5 },
          { name: "feat-b", status: "complete", completedTasks: 4, totalTasks: 4 },
        ],
      }],
      ["status:feat-a", {
        artifacts: [
          { id: "proposal", status: "done" },
          { id: "design", status: "ready" },
          { id: "tasks", status: "blocked" },
        ],
      }],
      ["status:feat-b", {
        artifacts: [
          { id: "proposal", status: "done" },
          { id: "tasks", status: "done" },
        ],
      }],
    ]));

    const result = pollOpenSpec("/project");
    expect(result.initialized).toBe(true);
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0]).toEqual({
      name: "feat-a",
      status: "in-progress",
      completedTasks: 3,
      totalTasks: 5,
      artifacts: [
        { id: "proposal", status: "done" },
        { id: "design", status: "ready" },
        { id: "tasks", status: "blocked" },
      ],
    });
    expect(result.changes[1].status).toBe("complete");
  });

  it("handles invalid JSON gracefully", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "not json {{{", stderr: "" });
    const result = pollOpenSpec("/project");
    expect(result).toEqual({ initialized: false, changes: [] });
  });

  it("handles status call failure gracefully (empty artifacts)", () => {
    mockCli(new Map([
      ["list", {
        changes: [
          { name: "feat-a", status: "no-tasks", completedTasks: 0, totalTasks: 0 },
        ],
      }],
      // No status:feat-a — status call fails
    ]));

    const result = pollOpenSpec("/project");
    expect(result.initialized).toBe(true);
    expect(result.changes[0].artifacts).toEqual([]);
  });
});
