/**
 * Pure helpers for the git-worktree feature that BOTH the server and the
 * client need (slug derivation for the live path preview, base-branch
 * fallback chain for the dialog's default base). Server-only helpers
 * (porcelain parser, `.git/info/exclude` mutation) stay in
 * `packages/server/src/git-worktree.ts`.
 *
 * Pure: no fs, no child_process, no platform branching. Safe to import
 * in any package.
 *
 * See change: add-worktree-spawn-dialog.
 */

/**
 * Convert a branch name into a filesystem-safe slug suitable for use as
 * a directory name under `.worktrees/`.
 *
 *   feat/Dark Mode!   → feat-dark-mode
 *   release/2026.05   → release-2026.05
 *   WIP: try a thing  → wip-try-a-thing
 *
 * Empty / all-stripped input yields `""` — callers SHOULD treat that
 * as a validation failure rather than fabricate a path.
 */
export function slugifyBranch(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[\/\\:\s]+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export interface ResolveDefaultBaseInput {
  /** Current HEAD branch in the parent repo, or `null` if detached. */
  currentBranch: string | null;
  /** All local branch names. */
  localBranches: ReadonlyArray<string>;
  /** All remote-tracking branch names (e.g. `origin/develop`). */
  remoteBranches: ReadonlyArray<string>;
}

export type ResolveDefaultBaseResult =
  | { ok: true; base: string }
  | { ok: false; error: "no_usable_base" };

/**
 * Pick a base branch for a new worktree:
 *   current (if attached + local) → develop → main → master → fail.
 * Local-first then `origin/<x>`. Detached HEAD falls through to named
 * candidates (never base-on-SHA).
 */
export function resolveDefaultBase(input: ResolveDefaultBaseInput): ResolveDefaultBaseResult {
  const { currentBranch, localBranches, remoteBranches } = input;
  const local = new Set(localBranches);
  const remote = new Set(remoteBranches);
  if (currentBranch && local.has(currentBranch)) {
    return { ok: true, base: currentBranch };
  }
  for (const candidate of ["develop", "main", "master"] as const) {
    if (local.has(candidate)) return { ok: true, base: candidate };
    if (remote.has(`origin/${candidate}`)) return { ok: true, base: `origin/${candidate}` };
  }
  return { ok: false, error: "no_usable_base" };
}
