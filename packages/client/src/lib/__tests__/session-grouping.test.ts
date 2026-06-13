/**
 * Phase-4c tests for workspace-aware session grouping (Decision 15).
 *
 * See change: add-jj-workspace-plugin.
 */
import { describe, it, expect } from "vitest";
import type { DashboardSession, JjState } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { groupSessionsByDirectory } from "../session-grouping.js";

function mk(
  id: string,
  cwd: string,
  startedAt: number,
  jjState?: Partial<JjState>,
): DashboardSession {
  return {
    id,
    cwd,
    source: "tui",
    status: "active",
    startedAt,
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    ...(jjState ? { jjState: { isJjRepo: true, isColocated: true, ...jjState } as JjState } : {}),
  } as DashboardSession;
}

describe("groupSessionsByDirectory — Decision 15 (workspace-aware grouping)", () => {
  it("workspace session collapses under parent repo when workspaceRoot is set", () => {
    const parent = mk("p", "/repo", 100);
    const ws = mk("w", "/repo/.shadow/np-tp", 200, {
      workspaceRoot: "/repo",
      workspaceName: "np-tp",
    });

    const { unpinned } = groupSessionsByDirectory([parent, ws], undefined, [], "linux");

    expect(unpinned).toHaveLength(1);
    expect(unpinned[0]!.cwd).toBe("/repo");
    expect(unpinned[0]!.sessions.map((s) => s.id).sort()).toEqual(["p", "w"]);
  });

  it("explicit pin on workspace path overrides workspaceRoot collapse", () => {
    const parent = mk("p", "/repo", 100);
    const ws = mk("w", "/repo/.shadow/np-tp", 200, {
      workspaceRoot: "/repo",
      workspaceName: "np-tp",
    });

    const { pinned, unpinned } = groupSessionsByDirectory(
      [parent, ws],
      undefined,
      ["/repo/.shadow/np-tp"],
      "linux",
    );

    // The workspace session must NOT collapse — it stays under its pinned cwd.
    expect(pinned).toHaveLength(1);
    expect(pinned[0]!.cwd).toBe("/repo/.shadow/np-tp");
    expect(pinned[0]!.sessions.map((s) => s.id)).toEqual(["w"]);

    // Parent session stays in its own (unpinned) group.
    expect(unpinned).toHaveLength(1);
    expect(unpinned[0]!.cwd).toBe("/repo");
    expect(unpinned[0]!.sessions.map((s) => s.id)).toEqual(["p"]);
  });

  it("collapsed group is NOT clustered by workspaceName — flat stored/recency order", () => {
    // Four sessions all collapsed under /repo (mixed main-tree + ws-X).
    // No cluster adjacency anymore: with no order map, ordering is purely
    // startedAt desc. See change: simplify-session-card-ordering (D8).
    const a = mk("A", "/repo", 100);
    const b = mk("B", "/repo/.shadow/x", 200, { workspaceRoot: "/repo", workspaceName: "x" });
    const c = mk("C", "/repo", 300);
    const d = mk("D", "/repo/.shadow/x", 400, { workspaceRoot: "/repo", workspaceName: "x" });

    const { unpinned } = groupSessionsByDirectory([a, b, c, d], undefined, [], "linux");

    expect(unpinned).toHaveLength(1);
    const ids = unpinned[0]!.sessions.map((s) => s.id);
    // startedAt desc, interleaving main-tree and ws-X freely.
    expect(ids).toEqual(["D", "C", "B", "A"]);
  });

  it("moved worktree session is NOT re-clustered back beside its siblings", () => {
    // Main checkout `a`, two worktree siblings `b`,`c` under feat-y. The
    // stored order surfaces a feat-y session (c) at the front, ahead of
    // the main checkout. No cluster rule reorders it back.
    const a = mk("a", "/repo", 100);
    const b = mk("b", "/repo/.worktrees/feat-y", 200);
    b.gitWorktree = { mainPath: "/repo", name: "feat-y" };
    const c = mk("c", "/repo/.worktrees/feat-y", 300);
    c.gitWorktree = { mainPath: "/repo", name: "feat-y" };
    const orderMap = new Map([["/repo", ["c", "a", "b"]]]);

    const { unpinned } = groupSessionsByDirectory([a, b, c], orderMap, [], "linux");
    expect(unpinned).toHaveLength(1);
    expect(unpinned[0]!.sessions.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("sessions without jjState continue to group by cwd (regression guard)", () => {
    const a = mk("a", "/repo", 100);
    const b = mk("b", "/other", 200);
    const { unpinned } = groupSessionsByDirectory([a, b], undefined, [], "linux");
    expect(unpinned).toHaveLength(2);
    const cwds = unpinned.map((g) => g.cwd).sort();
    expect(cwds).toEqual(["/other", "/repo"]);
  });

  it("default workspace (workspaceRoot === cwd) groups under cwd just like before", () => {
    // Default workspace probe sets workspaceRoot to its own cwd; the new
    // priority chain must NOT split it from a no-jjState peer at the same path.
    const a = mk("a", "/repo", 100, { workspaceRoot: "/repo", workspaceName: "default" });
    const b = mk("b", "/repo", 200);
    const { unpinned } = groupSessionsByDirectory([a, b], undefined, [], "linux");
    expect(unpinned).toHaveLength(1);
    expect(unpinned[0]!.cwd).toBe("/repo");
    expect(unpinned[0]!.sessions.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });
});
