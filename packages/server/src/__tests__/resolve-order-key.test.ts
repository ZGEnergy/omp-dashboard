import { describe, it, expect } from "vitest";
import { resolveOrderKey } from "../resolve-order-key.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

function session(partial: Partial<DashboardSession>): DashboardSession {
  return { id: "s", cwd: "/repo", status: "active", startedAt: 0, ...partial } as DashboardSession;
}

describe("resolveOrderKey", () => {
  it("plain checkout: key equals cwd", () => {
    expect(resolveOrderKey(session({ cwd: "/repo" }), [], "linux")).toBe("/repo");
  });

  it("worktree: key equals gitWorktree.mainPath", () => {
    const s = session({
      cwd: "/repo/.worktrees/feat-x",
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    expect(resolveOrderKey(s, [], "linux")).toBe("/repo");
  });

  it("jj: key equals jjState.workspaceRoot", () => {
    const s = session({
      cwd: "/repo/.shadow/ws-a",
      jjState: { workspaceRoot: "/repo", workspaceName: "ws-a", isJjRepo: true, isColocated: false },
    });
    expect(resolveOrderKey(s, [], "linux")).toBe("/repo");
  });

  it("jj wins over worktree when both present", () => {
    const s = session({
      cwd: "/repo/.shadow/ws-a",
      jjState: { workspaceRoot: "/jjroot", workspaceName: "ws-a", isJjRepo: true, isColocated: false },
      gitWorktree: { mainPath: "/wtroot", name: "ws-a" },
    });
    expect(resolveOrderKey(s, [], "linux")).toBe("/jjroot");
  });

  it("explicit pin of the worktree cwd wins over worktree collapse", () => {
    const s = session({
      cwd: "/repo/.worktrees/feat-x",
      gitWorktree: { mainPath: "/repo", name: "feat-x" },
    });
    expect(resolveOrderKey(s, ["/repo/.worktrees/feat-x"], "linux")).toBe(
      "/repo/.worktrees/feat-x",
    );
  });

  it("explicit pin of the jj cwd wins over jj collapse", () => {
    const s = session({
      cwd: "/repo/.shadow/ws-a",
      jjState: { workspaceRoot: "/repo", workspaceName: "ws-a", isJjRepo: true, isColocated: false },
    });
    expect(resolveOrderKey(s, ["/repo/.shadow/ws-a"], "linux")).toBe("/repo/.shadow/ws-a");
  });
});
