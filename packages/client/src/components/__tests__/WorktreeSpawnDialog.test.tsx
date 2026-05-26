/**
 * Component tests for `WorktreeSpawnDialog`. Pins the §6 contract:
 *
 *  - On mount, fetches getHead + listWorktrees + listBranches in parallel.
 *  - Loading state visible until all three resolve.
 *  - Existing-worktree rows: click → onSpawn(path) without gitWorktreeBase.
 *  - Create form: default base picked via the shared fallback helper;
 *    typing into newBranch updates the live path preview via slugifyBranch.
 *  - Submit → createWorktree → onSpawn(path, { gitWorktreeBase: base }).
 *  - Error responses render inline with the stable code, and stderr is
 *    rendered in a collapsed <details>.
 *  - Cancel button calls onCancel; Escape key does too.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorktreeSpawnDialog } from "../WorktreeSpawnDialog.js";

const { fetchGitHead, fetchWorktrees, fetchBranches, createWorktree } = vi.hoisted(() => ({
  fetchGitHead: vi.fn(),
  fetchWorktrees: vi.fn(),
  fetchBranches: vi.fn(),
  createWorktree: vi.fn(),
}));

vi.mock("../../lib/git-api.js", async () => {
  // We only re-mock the four helpers the dialog uses; everything else stays
  // intact in case the dialog grows new imports.
  const actual = await vi.importActual<typeof import("../../lib/git-api.js")>("../../lib/git-api.js");
  return {
    ...actual,
    fetchGitHead,
    fetchWorktrees,
    fetchBranches,
    createWorktree,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function defaultMocks(opts: {
  head?: { branch: string | null; detached: boolean; sha: string | null };
  worktrees?: Array<{ path: string; branch: string | null; isMain: boolean; detached?: boolean; bare?: boolean; sha?: string }>;
  localBranches?: string[];
  remoteBranches?: string[];
} = {}) {
  const head = opts.head ?? { branch: "main", detached: false, sha: "abc1234" };
  const worktrees = (opts.worktrees ?? [
    { path: "/repo", branch: "main", isMain: true },
  ]).map((w) => ({ sha: "", bare: false, detached: false, ...w }));
  const local = opts.localBranches ?? ["main", "develop"];
  const remote = opts.remoteBranches ?? [];
  fetchGitHead.mockResolvedValue(head);
  fetchWorktrees.mockResolvedValue(worktrees);
  fetchBranches.mockResolvedValue({
    current: head.branch ?? "HEAD",
    detached: head.detached,
    branches: [
      ...local.map((name) => ({ name, isRemote: false, isCurrent: name === head.branch })),
      ...remote.map((name) => ({ name, isRemote: true, isCurrent: false })),
    ],
  });
}

describe("WorktreeSpawnDialog — loading + existing worktrees", () => {
  it("shows a loading placeholder until all three fetches resolve", async () => {
    defaultMocks();
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId("worktree-dialog-loading")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("worktree-dialog-loading")).toBeNull());
    expect(screen.getByTestId("worktree-dialog-existing")).toBeTruthy();
  });

  it("renders one row per existing worktree (incl. main)", async () => {
    defaultMocks({
      worktrees: [
        { path: "/repo", branch: "main", isMain: true },
        { path: "/repo/.worktrees/feat-x", branch: "feat/x", isMain: false },
        { path: "/repo/.worktrees/fix-42", branch: "fix/42", isMain: false },
      ],
    });
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.queryByTestId("worktree-dialog-loading")).toBeNull());
    expect(screen.getByTestId("worktree-row-main")).toBeTruthy();
    expect(
      screen.getByTestId(`worktree-row-${encodeURIComponent("/repo/.worktrees/feat-x")}`),
    ).toBeTruthy();
  });

  it("clicking an existing-worktree row calls onSpawn(path) without gitWorktreeBase", async () => {
    defaultMocks({
      worktrees: [
        { path: "/repo", branch: "main", isMain: true },
        { path: "/repo/.worktrees/feat-x", branch: "feat/x", isMain: false },
      ],
    });
    const onSpawn = vi.fn();
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={onSpawn} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-row-main"));
    fireEvent.click(
      screen.getByTestId(`worktree-row-${encodeURIComponent("/repo/.worktrees/feat-x")}`),
    );
    expect(onSpawn).toHaveBeenCalledTimes(1);
    expect(onSpawn).toHaveBeenCalledWith("/repo/.worktrees/feat-x");
  });
});

describe("WorktreeSpawnDialog — create form", () => {
  it("defaults base via the shared resolver (current branch wins when local)", async () => {
    defaultMocks({
      head: { branch: "feature", detached: false, sha: "x" },
      localBranches: ["main", "develop", "feature"],
    });
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    const sel = screen.getByTestId("worktree-base-select") as HTMLSelectElement;
    expect(sel.value).toBe("feature");
  });

  it("falls through to develop when detached", async () => {
    defaultMocks({
      head: { branch: null, detached: true, sha: "abc" },
      localBranches: ["main", "develop", "master"],
    });
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    const sel = screen.getByTestId("worktree-base-select") as HTMLSelectElement;
    expect(sel.value).toBe("develop");
  });

  it("path preview updates live as user types newBranch (slugified)", async () => {
    defaultMocks();
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    const input = screen.getByTestId("worktree-new-branch-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "feat/Dark Mode!" } });
    const pathInput = screen.getByTestId("worktree-path-input") as HTMLInputElement;
    expect(pathInput.value).toBe("/repo/.worktrees/feat-dark-mode");
  });

  it("submit calls createWorktree then onSpawn with gitWorktreeBase", async () => {
    defaultMocks();
    createWorktree.mockResolvedValue({
      ok: true,
      path: "/repo/.worktrees/feat-x",
      branch: "feat/x",
      excludeAppended: true,
    });
    const onSpawn = vi.fn();
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={onSpawn} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));

    fireEvent.change(screen.getByTestId("worktree-new-branch-input"), {
      target: { value: "feat/x" },
    });
    fireEvent.click(screen.getByTestId("worktree-dialog-create-submit"));

    await waitFor(() => expect(onSpawn).toHaveBeenCalled());
    expect(createWorktree).toHaveBeenCalledWith({
      cwd: "/repo",
      base: "main",
      newBranch: "feat/x",
    });
    expect(onSpawn).toHaveBeenCalledWith("/repo/.worktrees/feat-x", { gitWorktreeBase: "main" });
  });

  it("submit disabled when newBranch is empty", async () => {
    defaultMocks();
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    const submitBtn = screen.getByTestId("worktree-dialog-create-submit") as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("renders structured error inline with stable code + stderr details on failure", async () => {
    defaultMocks();
    createWorktree.mockResolvedValue({
      ok: false,
      code: "branch_in_use",
      error: "branch is already checked out in another worktree",
      stderr: "fatal: 'feat/x' is already checked out at '/repo'",
    });
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));

    fireEvent.change(screen.getByTestId("worktree-new-branch-input"), {
      target: { value: "feat/x" },
    });
    fireEvent.click(screen.getByTestId("worktree-dialog-create-submit"));

    const errEl = await waitFor(() => screen.getByTestId("worktree-dialog-error"));
    expect(errEl.textContent).toContain("branch_in_use");
    expect(errEl.textContent).toContain("already checked out");
    // stderr in a collapsed details
    const summary = errEl.querySelector("summary");
    expect(summary?.textContent).toBe("git stderr");
  });

  it("clears inline error when the user edits the form after a failure", async () => {
    defaultMocks();
    createWorktree.mockResolvedValue({ ok: false, code: "git_failed", error: "boom" });
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    fireEvent.change(screen.getByTestId("worktree-new-branch-input"), {
      target: { value: "feat/x" },
    });
    fireEvent.click(screen.getByTestId("worktree-dialog-create-submit"));
    await waitFor(() => screen.getByTestId("worktree-dialog-error"));
    fireEvent.change(screen.getByTestId("worktree-new-branch-input"), {
      target: { value: "feat/y" },
    });
    await waitFor(() => expect(screen.queryByTestId("worktree-dialog-error")).toBeNull());
  });
});

describe("WorktreeSpawnDialog — load-error path", () => {
  it("renders load error when fetchGitHead rejects", async () => {
    defaultMocks();
    fetchGitHead.mockRejectedValueOnce(new Error("not a git repository"));
    render(<WorktreeSpawnDialog cwd="/some" onSpawn={() => {}} onCancel={() => {}} />);
    const err = await waitFor(() => screen.getByTestId("worktree-dialog-load-error"));
    expect(err.textContent).toContain("not a git repository");
  });
});

describe("WorktreeSpawnDialog — submodule footnote", () => {
  it("renders the submodule note when readHead reports hasSubmodules: true", async () => {
    defaultMocks({ head: { branch: "main", detached: false, sha: "x" } });
    // Override the default head mock with one that flags submodules.
    fetchGitHead.mockResolvedValueOnce({ branch: "main", detached: false, sha: "x", hasSubmodules: true });
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    expect(screen.getByTestId("worktree-dialog-submodule-note")).toBeTruthy();
  });

  it("omits the submodule note when no .gitmodules", async () => {
    defaultMocks();
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={() => {}} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    expect(screen.queryByTestId("worktree-dialog-submodule-note")).toBeNull();
  });
});

describe("WorktreeSpawnDialog — dismissal", () => {
  it("Cancel button calls onCancel", async () => {
    defaultMocks();
    const onCancel = vi.fn();
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={onCancel} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    fireEvent.click(screen.getByTestId("worktree-dialog-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Escape key calls onCancel", async () => {
    defaultMocks();
    const onCancel = vi.fn();
    render(<WorktreeSpawnDialog cwd="/repo" onSpawn={() => {}} onCancel={onCancel} />);
    await waitFor(() => screen.getByTestId("worktree-dialog-existing"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
