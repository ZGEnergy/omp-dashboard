/**
 * Server-side helpers for the git-worktree feature.
 *
 * Two helpers shared with the client (slug derivation, base-branch
 * fallback chain) live in `packages/shared/src/git-worktree-helpers.ts`
 * and are re-exported here for backward compatibility with the existing
 * server imports. The porcelain parser and `.git/info/exclude` mutator
 * are server-only (the client never reads / writes those).
 *
 * See change: add-worktree-spawn-dialog.
 */

// Re-export shared helpers so existing server-side imports keep working
// without churn (`import { slugifyBranch } from "./git-worktree.js"`).
export {
  slugifyBranch,
  resolveDefaultBase,
  type ResolveDefaultBaseInput,
  type ResolveDefaultBaseResult,
} from "@blackbelt-technology/pi-dashboard-shared/git-worktree-helpers.js";

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
