/**
 * Legacy file cleanup — one-shot best-effort removal of state files that
 * existed in earlier wizard implementations and are no longer authoritative.
 *
 * Currently scopes to `~/.pi-dashboard/mode.json`:
 *   - Pre-V2 launch-source path persisted `{ mode: "standalone" | "power-user" }`
 *     here to mark first-run completion.
 *   - V2 launch-source path derives "first-run" from filesystem state
 *     (managed dir populated?) and does not read or write `mode.json`.
 *   - Once the slimmed wizard ships (group 8), `mode.json` is dead code
 *     in every codepath; deleting it on launch makes that explicit.
 *
 * This module is called from the V2 launch path only. The legacy
 * (`LAUNCH_SOURCE_V2=false`) path still reads `mode.json` via
 * `wizard-state.ts::isFirstRun`, so the cleanup must not run there.
 *
 * Idempotent: missing file is a no-op. All filesystem errors are logged
 * and swallowed — this is a janitorial pass, never a failure surface.
 *
 * See change: streamline-electron-bootstrap-and-recovery (group 13).
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

export interface LegacyCleanupResult {
  removed: string[];
  errors: Array<{ path: string; message: string }>;
}

/**
 * Inspect the managed dir for known legacy state files and remove them.
 * Returns a summary suitable for structured logging.
 */
export function cleanupLegacyStateFiles(managedDir: string): LegacyCleanupResult {
  const removed: string[] = [];
  const errors: Array<{ path: string; message: string }> = [];

  // mode.json — pre-V2 wizard state. Authoritative source is now
  // filesystem (managed dir populated?). Safe to remove in V2 path.
  const modeFile = path.join(managedDir, "mode.json");
  if (existsSync(modeFile)) {
    try {
      rmSync(modeFile, { force: true });
      removed.push(modeFile);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ path: modeFile, message });
    }
  }

  return { removed, errors };
}
