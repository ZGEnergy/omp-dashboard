/**
 * Fullscreen dialog launched by the folder-action-bar's `+Worktree`
 * button. Two stacked sections:
 *
 *   1. Existing worktrees of the repo — each row is one-click `[Spawn →]`.
 *   2. Create a new worktree — base picker + new-branch input + path
 *      preview. On submit: POST /api/git/worktree, then auto-spawn a pi
 *      session in the returned path.
 *
 * See change: add-worktree-spawn-dialog.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWorktree,
  fetchBranches,
  fetchGitHead,
  fetchWorktrees,
  type CreateWorktreeError,
  type HeadInfo,
  type WorktreeEntry,
} from "../lib/git-api.js";
import {
  resolveDefaultBase,
  slugifyBranch,
} from "@blackbelt-technology/pi-dashboard-shared/git-worktree-helpers.js";

interface Props {
  /** Cwd to scope the dialog to (folder header's path). */
  cwd: string;
  /**
   * Called when the user chooses to spawn a pi session in a worktree path.
   * `gitWorktreeBase` is supplied when the dialog created a new worktree
   * (so the server can persist it to `.meta.json`); absent when the user
   * picked an existing worktree.
   */
  onSpawn: (worktreePath: string, opts?: { gitWorktreeBase?: string }) => void;
  onCancel: () => void;
}

interface LoadedData {
  worktrees: WorktreeEntry[];
  head: HeadInfo;
  localBranches: string[];
  remoteBranches: string[];
}

export function WorktreeSpawnDialog({ cwd, onSpawn, onCancel }: Props) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newBranch, setNewBranch] = useState("");
  const [base, setBase] = useState("");
  const [pathOverride, setPathOverride] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<CreateWorktreeError | null>(null);

  // ── load existing worktrees + head + branches in parallel ─────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [worktrees, head, branchList] = await Promise.all([
          fetchWorktrees(cwd),
          fetchGitHead(cwd),
          fetchBranches(cwd),
        ]);
        if (cancelled) return;
        const localBranches = branchList.branches.filter((b) => !b.isRemote).map((b) => b.name);
        const remoteBranches = branchList.branches.filter((b) => b.isRemote).map((b) => b.name);
        const loaded: LoadedData = { worktrees, head, localBranches, remoteBranches };
        setData(loaded);
        // Compute initial base via the shared fallback helper.
        const def = resolveDefaultBase({
          currentBranch: head.branch,
          localBranches,
          remoteBranches,
        });
        if (def.ok) setBase(def.base);
      } catch (err: any) {
        if (cancelled) return;
        setLoadError(err?.message ?? "failed to load worktree dialog");
      }
    })();
    return () => { cancelled = true; };
  }, [cwd]);

  // ── derived state ──────────────────────────────────────────────────────
  const slug = useMemo(() => slugifyBranch(newBranch), [newBranch]);
  const derivedPath = useMemo(() => {
    if (!data || !slug) return "";
    // Path preview: <repo>/.worktrees/<slug>. The repo root is the main
    // worktree's path returned by listWorktrees. Server is authoritative
    // — this is purely for user feedback.
    const main = data.worktrees.find((w) => w.isMain);
    if (!main) return `.worktrees/${slug}`;
    return joinPath(main.path, ".worktrees", slug);
  }, [data, slug]);
  const effectivePath = pathOverride ?? derivedPath;
  const allBranches = useMemo(() => {
    if (!data) return [] as string[];
    return [...data.localBranches, ...data.remoteBranches];
  }, [data]);

  const canSubmit =
    !!data &&
    !submitting &&
    newBranch.trim().length > 0 &&
    base.trim().length > 0 &&
    slug.length > 0;

  // ── handlers ───────────────────────────────────────────────────────────
  const handleSpawnExisting = useCallback((entry: WorktreeEntry) => {
    onSpawn(entry.path);
  }, [onSpawn]);

  const handleCreateAndSpawn = useCallback(async () => {
    if (!data) return;
    setSubmitting(true);
    setSubmitError(null);
    let res;
    try {
      res = await createWorktree({
        cwd,
        base,
        newBranch,
        ...(pathOverride ? { path: pathOverride } : {}),
      });
    } catch (err: any) {
      // Network failure, JSON parse error, or any other thrown exception.
      // Without this catch, `setSubmitting(false)` below would never run
      // and the button would stay disabled forever — forcing a reload.
      setSubmitting(false);
      setSubmitError({
        ok: false,
        code: "network_failure",
        error: err?.message ?? "network failure or unexpected error",
      });
      return;
    }
    setSubmitting(false);
    if (!res.ok) {
      setSubmitError(res);
      return;
    }
    onSpawn(res.path, { gitWorktreeBase: base });
  }, [data, cwd, base, newBranch, pathOverride, onSpawn]);

  // Reset error when the user edits the form after a failure.
  useEffect(() => {
    if (submitError) setSubmitError(null);
    // We intentionally watch only the inputs, not submitError itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newBranch, base, pathOverride]);

  // ── render ─────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <DialogChrome onCancel={onCancel} title="+Worktree Session">
        <div className="text-red-400" data-testid="worktree-dialog-load-error">{loadError}</div>
      </DialogChrome>
    );
  }
  if (!data) {
    return (
      <DialogChrome onCancel={onCancel} title="+Worktree Session">
        <div className="text-[var(--text-muted)]" data-testid="worktree-dialog-loading">Loading…</div>
      </DialogChrome>
    );
  }

  const hasUsableBase = base.trim().length > 0;

  return (
    <DialogChrome onCancel={onCancel} title="+Worktree Session">
      {/* ── existing worktrees ─────────────────────────────────────── */}
      <section className="mb-6" data-testid="worktree-dialog-existing">
        <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Existing worktrees of this repo
        </h4>
        <div className="rounded border border-[var(--border-subtle)] overflow-hidden">
          {data.worktrees.map((wt) => (
            <button
              key={wt.path}
              type="button"
              onClick={() => handleSpawnExisting(wt)}
              data-testid={`worktree-row-${wt.isMain ? "main" : encodeURIComponent(wt.path)}`}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] last:border-b-0"
            >
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {wt.detached ? "(detached)" : wt.branch ?? "(none)"}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] truncate flex-1">{wt.path}</span>
              {wt.isMain && (
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-1.5 py-px">main</span>
              )}
              <span className="text-[11px] text-blue-400">Spawn →</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── create new ─────────────────────────────────────────────── */}
      <section data-testid="worktree-dialog-create">
        <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Create a new worktree
        </h4>
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] text-[var(--text-tertiary)]">Base branch</span>
            <select
              data-testid="worktree-base-select"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="w-full mt-0.5 px-2 py-1 text-sm rounded border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]"
            >
              {!hasUsableBase && <option value="">no usable default base — pick one</option>}
              {allBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] text-[var(--text-tertiary)]">New branch name</span>
            <input
              data-testid="worktree-new-branch-input"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="feat/dark-mode"
              className="w-full mt-0.5 px-2 py-1 text-sm rounded border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] font-mono"
            />
          </label>

          <label className="block">
            <span className="text-[11px] text-[var(--text-tertiary)]">Path</span>
            <input
              data-testid="worktree-path-input"
              value={effectivePath}
              onChange={(e) => setPathOverride(e.target.value)}
              placeholder={derivedPath || "(enter a branch name to derive)"}
              className="w-full mt-0.5 px-2 py-1 text-sm rounded border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] font-mono text-[var(--text-tertiary)]"
            />
          </label>
        </div>

        {submitError && (
          <div className="mt-3 text-[11px]" data-testid="worktree-dialog-error">
            <div className={errorClass(submitError.code)}>
              <span className="font-mono">{submitError.code}</span>: {submitError.error}
            </div>
            {submitError.stderr && (
              <details className="mt-1">
                <summary className="text-[var(--text-muted)] cursor-pointer">git stderr</summary>
                <pre className="mt-1 text-[10px] whitespace-pre-wrap bg-[var(--bg-tertiary)] p-2 rounded border border-[var(--border-subtle)] max-h-32 overflow-auto">{submitError.stderr}</pre>
              </details>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            data-testid="worktree-dialog-cancel"
            className="px-3 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleCreateAndSpawn}
            data-testid="worktree-dialog-create-submit"
            className="px-3 py-1 text-sm rounded bg-blue-500/80 hover:bg-blue-500 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] text-white"
          >
            {submitting ? "Creating…" : "Create + Spawn →"}
          </button>
        </div>

        <p className="mt-3 text-[10px] text-[var(--text-muted)]">
          New worktrees start clean — copy <code className="font-mono">.env</code> and run install steps manually.
        </p>
        {data.head.hasSubmodules && (
          <p
            className="mt-1 text-[10px] text-yellow-400/80"
            data-testid="worktree-dialog-submodule-note"
          >
            This repo uses submodules; they will not be initialized in the new worktree.
          </p>
        )}
      </section>
    </DialogChrome>
  );
}

/** Outer fullscreen chrome (overlay + dismissable card). Matches the */
/* PinDirectoryDialog look so the dialog feels native to the app. */
function DialogChrome({
  children,
  onCancel,
  title,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  title: string;
}) {
  // Escape-to-cancel for keyboard-driven users.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 bg-[var(--bg-overlay)] flex items-center justify-center z-[60]">
      <div
        className="bg-[var(--bg-secondary)] rounded-lg p-6 w-full max-w-xl border border-[var(--border-secondary)]"
        data-testid="worktree-spawn-dialog"
      >
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Map a stable error code to a tailwind tone. */
function errorClass(code: string): string {
  switch (code) {
    case "branch_in_use":
    case "branch_exists":
    case "path_exists":
      return "text-yellow-400";
    case "base_not_found":
    case "cwd_invalid":
      return "text-orange-400";
    default:
      return "text-red-400";
  }
}

/** Tiny path-join that works with `/` and `\` separators safely. */
function joinPath(...parts: string[]): string {
  // Drop empty segments and collapse to native separator. We can't infer
  // the platform from a single path string, so default to `/` and let
  // the path preview be slightly off on Windows — server is authoritative.
  return parts.filter((p) => p.length > 0).join("/").replace(/\/+/g, "/");
}
