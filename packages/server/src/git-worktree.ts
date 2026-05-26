/**
 * Pure helpers for the git-worktree feature. No filesystem, no child_process,
 * no platform branching — just data in / data out, easy to unit-test.
 *
 * - `slugifyBranch`     branch name → filesystem-safe slug for path derivation
 * - `parsePorcelainWorktrees`  `git worktree list --porcelain` → typed list
 * - `resolveDefaultBase`  pick the default base ref (current → develop → main → master)
 * - `ensureWorktreeExcludeLine`  idempotent append of `.worktrees/` to .git/info/exclude
 *
 * See change: add-worktree-spawn-dialog.
 */

// ── slug ───────────────────────────────────────────────────────────────────

/**
 * Convert a branch name into a filesystem-safe slug suitable for use as
 * a directory name under `.worktrees/`.
 *
 *   feat/Dark Mode!   → feat-dark-mode
 *   release/2026.05   → release-2026.05
 *   WIP: try a thing  → wip-try-a-thing
 *
 * Rules:
 *   1. Lowercase.
 *   2. Collapse `/`, `\`, `:`, and whitespace runs to a single `-`.
 *   3. Strip any character that isn't `[a-z0-9._-]`.
 *   4. Trim leading / trailing `-`.
 *   5. Cap length at 64.
 *
 * An empty / all-stripped input yields `""` — callers SHOULD treat that
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

// ── porcelain parser ───────────────────────────────────────────────────────

/**
 * A single worktree entry as exposed to the browser.
 * Mirrors the `WorktreeEntry` wire shape in `git-operations-api` spec.
 */
export interface WorktreeEntry {
  path: string;
  branch: string | null;
  sha: string;
  bare: boolean;
  detached: boolean;
  /** True for exactly one entry — the main worktree (first record). */
  isMain: boolean;
}

/**
 * Parse `git worktree list --porcelain` output into a structured list.
 *
 * Porcelain shape (one record per worktree, records separated by blank lines):
 *
 *   worktree /path/to/main
 *   HEAD <sha>
 *   branch refs/heads/main
 *
 *   worktree /path/to/wt
 *   HEAD <sha>
 *   detached
 *
 *   worktree /path/to/bare
 *   bare
 *
 * Lines we don't recognize (e.g. `locked`, `prunable`) are tolerated and
 * ignored — they don't affect the fields we expose.
 *
 * The first non-empty record is flagged `isMain: true`; all subsequent
 * entries get `isMain: false`. Per git docs the porcelain output always
 * lists the main worktree first.
 */
export function parsePorcelainWorktrees(stdout: string): WorktreeEntry[] {
  const records = stdout.split(/\r?\n\s*\r?\n/);
  const out: WorktreeEntry[] = [];
  for (const record of records) {
    const lines = record.split(/\r?\n/);
    let path: string | undefined;
    let sha: string | undefined;
    let branchRef: string | undefined;
    let bare = false;
    let detached = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
      else if (line.startsWith("HEAD ")) sha = line.slice("HEAD ".length);
      else if (line.startsWith("branch ")) branchRef = line.slice("branch ".length);
      else if (line === "bare") bare = true;
      else if (line === "detached") detached = true;
    }
    if (!path) continue;
    const branch = branchRef ? branchRef.replace(/^refs\/heads\//, "") : null;
    out.push({
      path,
      branch: detached || bare ? null : branch,
      sha: sha ?? "",
      bare,
      detached,
      isMain: out.length === 0,
    });
  }
  return out;
}

// ── base-branch fallback ───────────────────────────────────────────────────

/**
 * Input for `resolveDefaultBase`. All branch lists are bare names (no
 * `refs/heads/` or `refs/remotes/` prefix; for remotes the `origin/`
 * prefix IS included).
 */
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
 * Pick a base branch for a new worktree. Per change design:
 *
 *   current branch (if not detached and exists locally)
 *     → develop  (local OR origin/develop)
 *     → main
 *     → master
 *     → no_usable_base
 *
 * Detached HEAD intentionally falls through to the named fallbacks
 * because `git worktree add ... <SHA>` would silently create a detached
 * worktree — almost never what the user wants from a "+Worktree" button.
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

// ── .git/info/exclude line management ──────────────────────────────────────

/**
 * Idempotently ensure `.worktrees/` is in `.git/info/exclude` content.
 *
 * Returns `{ content, appended }`:
 *   - `appended: false` when the line is already present (no-op).
 *   - `appended: true` when we added it; `content` includes a leading
 *     newline only when the existing content was non-empty and did NOT
 *     already end with one.
 *
 * Match semantics: the exact line `.worktrees/`, anchored to a full line.
 * We don't match `worktrees/` or `.worktrees` (no trailing slash) to
 * avoid colliding with unrelated patterns a user might have.
 *
 * Callers can pass the empty string when the file doesn't yet exist;
 * `appended` will be `true` and `content` will be `".worktrees/\n"`.
 */
export function ensureWorktreeExcludeLine(existing: string): {
  content: string;
  appended: boolean;
} {
  const lines = existing.split(/\r?\n/);
  for (const line of lines) {
    if (line === ".worktrees/") return { content: existing, appended: false };
  }
  if (existing.length === 0) {
    return { content: ".worktrees/\n", appended: true };
  }
  const needsLeadingNewline = !existing.endsWith("\n");
  return {
    content: existing + (needsLeadingNewline ? "\n.worktrees/\n" : ".worktrees/\n"),
    appended: true,
  };
}
