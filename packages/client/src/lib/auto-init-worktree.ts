/**
 * Post-spawn worktree auto-init trigger.
 *
 * When the `autoInitWorktreeOnSpawn` preference is ON, a freshly spawned
 * worktree auto-runs its declared `worktreeInit` hook — but ONLY when the
 * hook is already TOFU-trusted and the gate reports `needsInit`. Untrusted
 * hooks never auto-run: the manual `WorktreeInitButton` stays the only path
 * to grant trust (the trust gate is enforced server-side regardless).
 *
 * The auto-trigger never sends a `confirmHash`, so an untrusted hook that
 * slips past the client probe still returns `init_untrusted` server-side
 * and does not execute.
 *
 * See change: auto-init-worktree-on-spawn.
 */
import {
  fetchAutoInitWorktreePref,
  fetchWorktreeInitStatus,
  runWorktreeInit,
} from "./git-api.js";

let reqCounter = 0;
function mintRequestId(): string {
  return `winit-auto-${Date.now()}-${reqCounter++}`;
}

/**
 * Fire-and-forget auto-init for a newly spawned worktree `cwd`.
 *
 * No-op unless: preference ON AND init-status reports
 * `{ hasHook: true, needsInit: true, trusted: true }`. Returns `true` when
 * it issued a `runWorktreeInit` call, `false` otherwise (for tests/diagnostics).
 */
export async function maybeAutoInitWorktreeOnSpawn(cwd: string): Promise<boolean> {
  const enabled = await fetchAutoInitWorktreePref();
  if (!enabled) return false;

  const status = await fetchWorktreeInitStatus(cwd);
  if (status.hasHook !== true || status.needsInit !== true || status.trusted !== true) {
    return false;
  }

  // Trusted + needs init → run. Never pass confirmHash (TOFU invariant).
  await runWorktreeInit({ cwd, requestId: mintRequestId() });
  return true;
}
