/**
 * Server-side git operations — branch listing, checkout, init, stash,
 * worktree (head probe, list, create).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import {
  ensureWorktreeExcludeLine,
  parsePorcelainWorktrees,
  slugifyBranch,
  type WorktreeEntry,
} from "./git-worktree.js";

const GIT_TIMEOUT = 15_000;

/** Run a git command, return trimmed stdout. Throws on failure. */
function run(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: GIT_TIMEOUT,
  }).trim();
}

/** Run a git command, return trimmed stdout or undefined on failure. */
function tryRun(command: string, cwd: string): string | undefined {
  try {
    return run(command, cwd);
  } catch {
    return undefined;
  }
}

/** Check if cwd is inside a git work tree. */
export function isGitRepo(cwd: string): boolean {
  return tryRun("git rev-parse --is-inside-work-tree", cwd) === "true";
}

/** Get list of dirty files from git status --porcelain. */
export function getDirtyFiles(cwd: string): string[] {
  let output: string;
  try {
    output = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: GIT_TIMEOUT,
    });
  } catch {
    return [];
  }
  return output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3)); // strip 2 status chars + space
}

export interface BranchInfo {
  current: string;
  detached: boolean;
  branches: Array<{ name: string; isRemote: boolean; isCurrent: boolean }>;
}

/** List all local and remote branches sorted by most recent commit. */
export function listBranches(cwd: string): BranchInfo {
  // Detect current branch / detached HEAD
  const headRef = tryRun("git rev-parse --abbrev-ref HEAD", cwd);

  // Empty repo (no commits yet)
  if (!headRef) {
    // Try to read the default branch name from HEAD
    const symbolic = tryRun("git symbolic-ref --short HEAD", cwd);
    return {
      current: symbolic ?? "main",
      detached: false,
      branches: [],
    };
  }
  const detached = headRef === "HEAD";
  const current = detached
    ? run("git rev-parse --short HEAD", cwd)
    : headRef;

  // List all branches with committer date sorting
  const format = "%(refname:short)%(HEAD)";
  const rawLocal = tryRun(
    `git branch --sort=-committerdate --format="${format}"`,
    cwd
  ) ?? "";
  const rawRemote = tryRun(
    `git branch -r --sort=-committerdate --format="${format}"`,
    cwd
  ) ?? "";

  const localBranches: BranchInfo["branches"] = [];
  for (const line of rawLocal.split("\n").filter(Boolean)) {
    const isCurrent = line.includes("*");
    const name = line.replace("*", "").trim();
    if (!name) continue;
    localBranches.push({ name, isRemote: false, isCurrent });
  }

  // Collect local branch names for dedup
  const localNames = new Set(localBranches.map((b) => b.name));

  const remoteBranches: BranchInfo["branches"] = [];
  for (const line of rawRemote.split("\n").filter(Boolean)) {
    const name = line.replace("*", "").trim();
    // Skip HEAD pointers like "origin/HEAD"
    if (name.endsWith("/HEAD")) continue;
    // Skip remote branches that have a local counterpart
    const localName = name.replace(/^[^/]+\//, ""); // "origin/foo" → "foo"
    if (localNames.has(localName)) continue;
    remoteBranches.push({ name, isRemote: true, isCurrent: false });
  }

  return {
    current,
    detached,
    branches: [...localBranches, ...remoteBranches],
  };
}

export interface CheckoutResult {
  success: true;
  stashed?: boolean;
}

export interface CheckoutDirty {
  success: false;
  dirty: true;
  files: string[];
}

/** Checkout a branch. Returns dirty info if working tree is dirty and stash=false. */
export function checkoutBranch(
  cwd: string,
  branch: string,
  stash: boolean
): CheckoutResult | CheckoutDirty {
  // Already on this branch?
  const headRef = tryRun("git rev-parse --abbrev-ref HEAD", cwd);
  if (headRef === branch) return { success: true };

  const dirtyFiles = getDirtyFiles(cwd);

  if (dirtyFiles.length > 0 && !stash) {
    return { success: false, dirty: true, files: dirtyFiles };
  }

  let stashed = false;
  if (dirtyFiles.length > 0 && stash) {
    run("git stash push -u -m \"pi-dashboard-auto-stash\"", cwd);
    stashed = true;
  }

  // Check if this is a remote branch that needs a local tracking branch
  const isRemote = branch.includes("/");
  if (isRemote) {
    const localName = branch.replace(/^[^/]+\//, "");
    // Check if local branch exists
    const localExists = tryRun(`git rev-parse --verify refs/heads/${localName}`, cwd);
    if (!localExists) {
      run(`git checkout -b ${localName} ${branch}`, cwd);
      return { success: true, stashed };
    }
    // Local branch exists, just checkout
    run(`git checkout ${localName}`, cwd);
    return { success: true, stashed };
  }

  run(`git checkout ${branch}`, cwd);
  return { success: true, stashed };
}

/** Initialize a git repository. Throws if already a git repo. */
export function gitInit(cwd: string): void {
  if (isGitRepo(cwd)) {
    throw new Error("already a git repository");
  }
  run("git init", cwd);
}

export interface StashPopResult {
  conflicts: boolean;
}

// ── Worktree operations ────────────────────────────────────────────────────────────────
// See change: add-worktree-spawn-dialog.

export interface HeadInfo {
  /** Current branch name, or `null` for detached HEAD. */
  branch: string | null;
  detached: boolean;
  /** Short HEAD SHA, or `null` when the repo is empty (no commits yet). */
  sha: string | null;
}

/** Read HEAD state of a git repo. */
export function readHead(cwd: string): HeadInfo {
  // Detect detached HEAD via symbolic-ref --quiet (exits non-zero when detached).
  const symbolic = tryRun("git symbolic-ref --quiet --short HEAD", cwd);
  const sha = tryRun("git rev-parse --short HEAD", cwd) ?? null;
  if (symbolic) {
    return { branch: symbolic, detached: false, sha };
  }
  // No symbolic ref → either detached or empty repo.
  return {
    branch: null,
    detached: sha !== null,
    sha,
  };
}

/** List all worktrees of the repository containing `cwd`. */
export function listWorktrees(cwd: string): WorktreeEntry[] {
  const stdout = run("git worktree list --porcelain", cwd);
  return parsePorcelainWorktrees(stdout);
}

export type AddWorktreeError =
  | "not_a_repo"
  | "cwd_invalid"
  | "branch_in_use"
  | "branch_exists"
  | "path_exists"
  | "base_not_found"
  | "git_failed";

export interface AddWorktreeSuccess {
  ok: true;
  path: string;
  branch: string;
  /** True iff this call appended `.worktrees/` to `.git/info/exclude`. */
  excludeAppended: boolean;
}

export interface AddWorktreeFailure {
  ok: false;
  error: AddWorktreeError;
  message: string;
  stderr?: string;
}

export interface AddWorktreeOptions {
  /** Cwd inside the parent repo (any worktree's path resolves to the same parent). */
  cwd: string;
  /** Base ref to fork from (local or `origin/<x>`). */
  base: string;
  /** New branch name to create at the worktree's HEAD. */
  newBranch: string;
  /** Optional explicit path; derived from slug when absent. */
  path?: string;
  /** Pass `--force` to `git worktree add` (defaults to false). */
  force?: boolean;
}

/**
 * Create a new worktree. Pure orchestration over `git worktree add` plus
 * the `.git/info/exclude` housekeeping.
 *
 * Returns a discriminated union with stable error codes so the route
 * handler can map straight to HTTP status without re-parsing stderr.
 */
export function addWorktree(opts: AddWorktreeOptions): AddWorktreeSuccess | AddWorktreeFailure {
  const { cwd, base, newBranch, force } = opts;
  if (!isGitRepo(cwd)) {
    return { ok: false, error: "not_a_repo", message: "not a git repository" };
  }
  // Resolve to the parent repo root (works whether cwd is the main checkout
  // or any sibling worktree). `git rev-parse --show-toplevel` from a
  // worktree returns the worktree's own root, NOT the main repo. We want
  // the MAIN repo so `.worktrees/<slug>` lands consistently regardless of
  // which worktree opened the dialog. Read `--git-common-dir` and walk up.
  const commonDirRaw = tryRun("git rev-parse --git-common-dir", cwd);
  if (!commonDirRaw) {
    return { ok: false, error: "not_a_repo", message: "unable to resolve git common-dir" };
  }
  const commonDirAbs = path.isAbsolute(commonDirRaw)
    ? commonDirRaw
    : path.resolve(cwd, commonDirRaw);
  const repoRoot = path.dirname(commonDirAbs);

  // Derive worktree path when not supplied.
  let worktreePath = opts.path;
  if (!worktreePath) {
    const slug = slugifyBranch(newBranch);
    if (!slug) {
      return {
        ok: false,
        error: "git_failed",
        message: `cannot derive a filesystem-safe slug from branch name "${newBranch}"`,
      };
    }
    worktreePath = path.join(repoRoot, ".worktrees", slug);
  }

  // Pre-flight: path must not exist (or must be empty).
  if (fs.existsSync(worktreePath)) {
    const isEmpty = (() => {
      try { return fs.readdirSync(worktreePath).length === 0; } catch { return false; }
    })();
    if (!isEmpty) {
      return {
        ok: false,
        error: "path_exists",
        message: `target path already exists and is not empty: ${worktreePath}`,
      };
    }
  }

  // Run `git worktree add -b <newBranch> <path> <base>` (+ optional --force).
  // Args are quoted via single-shell-arg escaping below.
  const args = ["git", "worktree", "add"];
  if (force) args.push("--force");
  args.push("-b", newBranch, worktreePath, base);
  const cmd = args.map(shellEscape).join(" ");
  try {
    execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: GIT_TIMEOUT,
    });
  } catch (err: any) {
    const stderr = String(err?.stderr ?? err?.message ?? "");
    // Map common stderr patterns onto stable error codes. The exact
    // wording varies by git version; we match generously.
    if (/already used by worktree at|is already checked out at/i.test(stderr)) {
      return { ok: false, error: "branch_in_use", message: "branch is already checked out in another worktree", stderr };
    }
    if (/A branch named.*already exists|branch '.*' already exists/i.test(stderr)) {
      return { ok: false, error: "branch_exists", message: `branch "${newBranch}" already exists`, stderr };
    }
    if (/invalid reference|unknown revision|not a valid object name/i.test(stderr)) {
      return { ok: false, error: "base_not_found", message: `base ref not found: ${base}`, stderr };
    }
    if (/'.*' already exists/i.test(stderr)) {
      return { ok: false, error: "path_exists", message: `target path already exists: ${worktreePath}`, stderr };
    }
    return { ok: false, error: "git_failed", message: "git worktree add failed", stderr };
  }

  // Append `.worktrees/` to .git/info/exclude (idempotent). ONLY do this
  // when we derived the path — if the user supplied an explicit `path`
  // they're opting out of the convention.
  let excludeAppended = false;
  if (!opts.path) {
    const excludePath = path.join(commonDirAbs, "info", "exclude");
    try {
      const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf-8") : "";
      const result = ensureWorktreeExcludeLine(existing);
      if (result.appended) {
        fs.mkdirSync(path.dirname(excludePath), { recursive: true });
        fs.writeFileSync(excludePath, result.content);
        excludeAppended = true;
      }
    } catch (err) {
      // Non-fatal: the worktree is created; exclude write is housekeeping.
      console.error(`[git-worktree] failed to update .git/info/exclude:`, err);
    }
  }

  return { ok: true, path: worktreePath, branch: newBranch, excludeAppended };
}

/**
 * Single-arg shell-escape helper. Sufficient for the path / branch /
 * base values we pass; we never interpolate user-controlled shell
 * fragments. Wraps in single quotes and escapes embedded single quotes.
 */
function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** Pop the most recent stash. */
export function stashPop(cwd: string): StashPopResult {
  // Check if there are stash entries
  const stashList = tryRun("git stash list", cwd);
  if (!stashList) {
    throw new Error("no stash entries");
  }

  try {
    run("git stash pop", cwd);
    return { conflicts: false };
  } catch (err: any) {
    // git stash pop exits non-zero on conflicts but still applies
    const msg: string = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
    if (msg.includes("CONFLICT") || msg.includes("conflict") || msg.includes("Merge conflict")) {
      return { conflicts: true };
    }
    throw err;
  }
}
