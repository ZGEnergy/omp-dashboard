/**
 * Tests for git-worktree precedence in `resolveSessionGroupPath` and
 * cluster-adjacency for worktree sessions in `groupSessionsByDirectory`.
 *
 * Pins the §5 contract from `add-worktree-spawn-dialog`:
 *   - Worktree session collapses under its `gitWorktree.mainPath`.
 *   - Explicit pin of the worktree path wins (pin > worktree).
 *   - When BOTH jjState.workspaceRoot AND gitWorktree.mainPath apply,
 *     jj wins (jj is step 2, worktree is step 3).
 *   - Worktree sessions cluster adjacent within the parent group.
 *   - Cluster sort is stable: server-provided ordering is preserved
 *     within each cluster.
 */
import { describe, it, expect } from "vitest";
import type {
  DashboardSession,
  GitWorktreeInfo,
  JjState,
} from "@blackbelt-technology/pi-dashboard-shared/types.js";
import {
  groupSessionsByDirectory,
  resolveSessionGroupPath,
} from "../session-grouping.js";

function mk(
  id: string,
  cwd: string,
  startedAt: number,
  opts: { jjState?: Partial<JjState>; gitWorktree?: GitWorktreeInfo } = {},
): DashboardSession {
  const { jjState, gitWorktree } = opts;
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
    ...(gitWorktree ? { gitWorktree } : {}),
  } as DashboardSession;
}

describe("resolveSessionGroupPath — worktree precedence (step 3)", () => {
  it("worktree session resolves to mainPath when no pin / jj applies", () => {
    const s = mk("s", "/repo/.worktrees/feat-x", 100, {
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    expect(resolveSessionGroupPath(s, new Set(), "linux")).toBe("/repo");
  });

  it("explicit pin of worktree path wins over worktree collapse", () => {
    const s = mk("s", "/repo/.worktrees/feat-x", 100, {
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    const pinnedKeys = new Set(["/repo/.worktrees/feat-x"]);
    expect(resolveSessionGroupPath(s, pinnedKeys, "linux")).toBe("/repo/.worktrees/feat-x");
  });

  it("jj workspace wins over worktree (step 2 before step 3)", () => {
    const s = mk("s", "/repo/.shadow/np", 100, {
      jjState: { workspaceRoot: "/parent-jj-root", workspaceName: "np" },
      gitWorktree: { mainPath: "/parent-git-root", name: "shadow-np" },
    });
    expect(resolveSessionGroupPath(s, new Set(), "linux")).toBe("/parent-jj-root");
  });

  it("plain checkout falls through to cwd", () => {
    const s = mk("s", "/some/path", 100);
    expect(resolveSessionGroupPath(s, new Set(), "linux")).toBe("/some/path");
  });
});

describe("groupSessionsByDirectory — worktree clustering", () => {
  it("worktree session collapses under pinned parent repo", () => {
    const main = mk("main", "/repo", 100);
    const wt = mk("wt", "/repo/.worktrees/feat-x", 200, {
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    const { pinned } = groupSessionsByDirectory([main, wt], undefined, ["/repo"], "linux");
    expect(pinned).toHaveLength(1);
    expect(pinned[0]!.cwd).toBe("/repo");
    expect(pinned[0]!.sessions.map((s) => s.id).sort()).toEqual(["main", "wt"]);
  });

  it("worktree session in unpinned mode also collapses under main repo", () => {
    const main = mk("main", "/repo", 100);
    const wt = mk("wt", "/repo/.worktrees/feat-x", 200, {
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    const { pinned, unpinned } = groupSessionsByDirectory([main, wt], undefined, [], "linux");
    expect(pinned).toEqual([]);
    expect(unpinned).toHaveLength(1);
    expect(unpinned[0]!.cwd).toBe("/repo");
  });

  it("explicit pin of worktree path renders worktree as its own group", () => {
    const main = mk("main", "/repo", 100);
    const wt = mk("wt", "/repo/.worktrees/feat-x", 200, {
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    const { pinned } = groupSessionsByDirectory(
      [main, wt],
      undefined,
      ["/repo", "/repo/.worktrees/feat-x"],
      "linux",
    );
    expect(pinned).toHaveLength(2);
    const repoGroup = pinned.find((g) => g.cwd === "/repo");
    const wtGroup = pinned.find((g) => g.cwd === "/repo/.worktrees/feat-x");
    expect(repoGroup?.sessions.map((s) => s.id)).toEqual(["main"]);
    expect(wtGroup?.sessions.map((s) => s.id)).toEqual(["wt"]);
  });

  it("worktree sessions cluster adjacent within parent group", () => {
    // Order chosen so naive sort-by-startedAt would interleave (a, b, c, d, e).
    // Cluster sort must put main-checkout first, then all feat-x adjacent,
    // then all feat-y adjacent — regardless of startedAt.
    const a = mk("a", "/repo", 500); // main
    const b = mk("b", "/repo/.worktrees/feat-y", 400, {
      gitWorktree: { mainPath: "/repo", name: "feat-y" },
    });
    const c = mk("c", "/repo/.worktrees/feat-x", 300, {
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    const d = mk("d", "/repo/.worktrees/feat-y", 200, {
      gitWorktree: { mainPath: "/repo", name: "feat-y" },
    });
    const e = mk("e", "/repo/.worktrees/feat-x", 100, {
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    const { pinned } = groupSessionsByDirectory([a, b, c, d, e], undefined, ["/repo"], "linux");
    expect(pinned).toHaveLength(1);
    const ids = pinned[0]!.sessions.map((s) => s.id);
    // Expected: main (a) first, then alphabetical clusters (feat-x: c,e then
    // feat-y: b,d). Within each cluster relative order from sortSessionsByOrder
    // (descending startedAt) is preserved.
    expect(ids).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("cluster sort preserves server-provided session order within each cluster", () => {
    const a = mk("a", "/repo", 100);
    const b = mk("b", "/repo/.worktrees/feat", 200, {
      gitWorktree: { mainPath: "/repo", name: "feat" },
    });
    const c = mk("c", "/repo/.worktrees/feat", 300, {
      gitWorktree: { mainPath: "/repo", name: "feat" },
    });
    // Server says: c before b inside the /repo group.
    const orderMap = new Map<string, string[]>([["/repo", ["c", "b", "a"]]]);
    const { pinned } = groupSessionsByDirectory([a, b, c], orderMap, ["/repo"], "linux");
    const ids = pinned[0]!.sessions.map((s) => s.id);
    // 'a' is main-cluster (empty cluster key), comes first.
    // Then feat cluster preserves server order: c, b.
    expect(ids).toEqual(["a", "c", "b"]);
  });

  it("jj + worktree on same session: jj wins clustering too", () => {
    const s = mk("s", "/repo/.shadow/np", 100, {
      jjState: { workspaceRoot: "/repo", workspaceName: "jj-ws" },
      gitWorktree: { mainPath: "/repo", name: "wt-cluster" },
    });
    const main = mk("main", "/repo", 200);
    const { pinned } = groupSessionsByDirectory([s, main], undefined, ["/repo"], "linux");
    expect(pinned[0]!.cwd).toBe("/repo");
    // Both group there; clustering key is jjState.workspaceName ("jj-ws"),
    // not the worktree name. The empty-key cluster (main) goes first.
    expect(pinned[0]!.sessions.map((s) => s.id)).toEqual(["main", "s"]);
  });

  it("backward-compat: session without gitWorktree behaves as plain checkout", () => {
    const s = mk("s", "/some/path", 100);
    const { unpinned } = groupSessionsByDirectory([s], undefined, [], "linux");
    expect(unpinned).toHaveLength(1);
    expect(unpinned[0]!.cwd).toBe("/some/path");
  });
});
