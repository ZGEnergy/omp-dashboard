/**
 * Force-reinstall safe-wipe — surgical reset of Electron-owned managed
 * packages while preserving everything else under `~/.pi-dashboard/` AND
 * everything outside the managed dir.
 *
 * Safety model (defense in depth):
 *   1. `planSafeWipe(managedDir)` enumerates `node_modules/` entries and
 *      classifies each against `ELECTRON_OWNED_PACKAGES`. User-installed
 *      packages (e.g. `pi-foo` from `npm install pi-foo` or
 *      `/api/pi-core/update`) end up in `preserve[]`, never `wipe[]`.
 *   2. Always-wipe entries are scoped to `<managedDir>/node/` (bundled
 *      Node runtime, repaired by `installManagedNode`) and
 *      `<managedDir>/.offline-cache/` (transient extraction staging).
 *   3. `forceReinstall` rejects any computed wipe path that escapes
 *      `<managedDir>/` — extra belt-and-suspenders against logic bugs.
 *   4. `~/.pi/` paths (config, sessions, credentials, preferences) are
 *      structurally outside `<managedDir>` and therefore untouchable by
 *      design; we never enumerate or inspect them here.
 *
 * Used by:
 *   - Doctor's "Force reinstall" button
 *   - Loading-page "Force reinstall" link (revealed after corruption or
 *     a failed reinstall attempt)
 *
 * See change: streamline-electron-bootstrap-and-recovery.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { ELECTRON_OWNED_PACKAGES } from "@blackbelt-technology/pi-dashboard-shared/managed-package-whitelist.js";
import { installManagedNode } from "@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js";
import { materializeWorkspaceSymlinks } from "@blackbelt-technology/pi-dashboard-shared/managed-workspace-materialize.js";

/** Result of `planSafeWipe`. Pure data; no side effects. */
export interface SafeWipePlan {
  /** Absolute paths that will be removed by `forceReinstall`. */
  wipe: string[];
  /** Absolute paths under `node_modules/` that will be preserved. */
  preserve: string[];
}

/**
 * Pure I/O: enumerate `<managedDir>/node_modules/` and classify each entry
 * against `ELECTRON_OWNED_PACKAGES`.
 *
 * Scoped packages (`@scope/pkg`) are walked one level deeper so the
 * wipe/preserve decision is per-package, not per-scope.
 *
 * npm-internal entries (`.bin/`, `.package-lock.json`, anything starting
 * with `.`) are skipped — npm regenerates them on every install, so
 * neither wiping nor preserving them carries a contract.
 *
 * The `node/` runtime directory and `.offline-cache/` staging directory
 * are unconditionally added to `wipe[]` regardless of presence on disk —
 * `forceReinstall` no-ops on absent paths via `rmSync({ force: true })`.
 */
export function planSafeWipe(managedDir: string): SafeWipePlan {
  const wipe: string[] = [];
  const preserve: string[] = [];

  const nodeModulesDir = path.join(managedDir, "node_modules");

  if (existsSync(nodeModulesDir)) {
    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      entries = readdirSync(nodeModulesDir, { withFileTypes: true });
    } catch {
      // node_modules unreadable — treat as empty for planning purposes.
      // The reinstall step will recreate it.
      entries = [];
    }

    for (const entry of entries) {
      // Skip npm-internal entries.
      if (entry.name.startsWith(".")) continue;
      if (!entry.isDirectory()) continue;

      if (entry.name.startsWith("@")) {
        // Scoped: walk one level deeper, decide per-package.
        const scopeDir = path.join(nodeModulesDir, entry.name);
        let inner: Array<{ name: string; isDirectory: () => boolean }>;
        try {
          inner = readdirSync(scopeDir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const sub of inner) {
          if (sub.name.startsWith(".")) continue;
          if (!sub.isDirectory()) continue;
          const fullName = `${entry.name}/${sub.name}`;
          const absPath = path.join(scopeDir, sub.name);
          if (ELECTRON_OWNED_PACKAGES.has(fullName)) wipe.push(absPath);
          else preserve.push(absPath);
        }
      } else {
        const absPath = path.join(nodeModulesDir, entry.name);
        if (ELECTRON_OWNED_PACKAGES.has(entry.name)) wipe.push(absPath);
        else preserve.push(absPath);
      }
    }
  }

  // Always-wipe entries. `rmSync({ force: true })` no-ops on absent paths,
  // so we add unconditionally rather than gating on `existsSync`.
  wipe.push(path.join(managedDir, "node"));
  wipe.push(path.join(managedDir, ".offline-cache"));

  return { wipe, preserve };
}

/** Result envelope for `forceReinstall`. */
export interface ForceReinstallResult {
  ok: boolean;
  wiped: string[];
  preserved: string[];
  error?: string;
}

/** Pluggable installer hook (set by Electron's dependency-installer). */
export type InstallStandaloneFn = (
  onProgress?: (p: { step: string; status: string; output?: string; error?: string }) => void,
  skipPackages?: string[],
) => Promise<void>;

export interface ForceReinstallOptions {
  managedDir: string;
  /** Bundled Node source dir for `installManagedNode`. Null = no managed Node copy. */
  bundledNodeDir?: string | null;
  /** Injected installer. Required (no default — depends on Electron resources). */
  installStandalone: InstallStandaloneFn;
  /** Optional progress hook. Stream of operation status lines. */
  onProgress?: (msg: string) => void;
}

/**
 * Execute a force-reinstall: wipe Electron-owned packages + always-wipe
 * dirs, then run the supplied installer. Caller is responsible for
 * shutting down the server before invoking this function.
 *
 * Belt-and-suspenders: every computed wipe path is verified to start with
 * the managed dir prefix before `rmSync`. A logic bug producing a path
 * outside the managed dir SHALL fail loudly rather than silently nuke
 * unrelated state.
 */
export async function forceReinstall(
  opts: ForceReinstallOptions,
): Promise<ForceReinstallResult> {
  const { managedDir, bundledNodeDir, installStandalone, onProgress } = opts;
  const plan = planSafeWipe(managedDir);

  // Safety: refuse any path that escapes managedDir.
  const managedDirAbs = path.resolve(managedDir);
  const escapes: string[] = [];
  for (const p of plan.wipe) {
    const abs = path.resolve(p);
    const rel = path.relative(managedDirAbs, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      escapes.push(abs);
    }
  }
  if (escapes.length > 0) {
    return {
      ok: false,
      wiped: [],
      preserved: plan.preserve,
      error: `Refusing to wipe paths outside managed dir: ${escapes.join(", ")}`,
    };
  }

  // Step 1: wipe.
  const wipedActual: string[] = [];
  for (const p of plan.wipe) {
    onProgress?.(`Wiping ${p}…`);
    try {
      rmSync(p, { recursive: true, force: true });
      wipedActual.push(p);
    } catch (err: any) {
      return {
        ok: false,
        wiped: wipedActual,
        preserved: plan.preserve,
        error: `Failed to wipe ${p}: ${err?.message ?? err}`,
      };
    }
  }

  // Step 2: restore bundled Node (idempotent; no-op if bundledNodeDir is null).
  if (bundledNodeDir) {
    onProgress?.("Restoring bundled Node runtime…");
    try {
      await installManagedNode({
        managedDir,
        bundledNodeDir,
        progress: (p) => onProgress?.(`node-runtime: ${p.status}${p.output ? ` (${p.output})` : ""}`),
      });
    } catch (err: any) {
      // Non-fatal: `installStandalone` will also call `installManagedNode`.
      onProgress?.(`Bundled Node restore warning: ${err?.message ?? err}`);
    }
  }

  // Step 3: run the installer.
  onProgress?.("Reinstalling packages…");
  try {
    await installStandalone((p) => {
      if (p.output) onProgress?.(`${p.step}: ${p.output}`);
      else onProgress?.(`${p.step}: ${p.status}`);
    });
  } catch (err: any) {
    return {
      ok: false,
      wiped: wipedActual,
      preserved: plan.preserve,
      error: `Reinstall failed: ${err?.message ?? err}`,
    };
  }

  // Step 4: re-materialize @blackbelt-technology/* into node_modules.
  //
  // `npm install` in step 3 prunes node_modules entries not declared in
  // package.json. The workspace packages (@blackbelt-technology/*) are
  // materialized from <managedDir>/packages/, not declared as deps, so npm
  // wipes them. Without this step the server would 500 on any lazy require
  // from those packages (e.g. fastify subdeps → readable-stream).
  //
  // `force: true` ensures we overwrite the empty/stale scope dir left by
  // npm prune. Errors are non-fatal — the next server bootstrap also runs
  // materialize, so this is belt-and-suspenders.
  onProgress?.("Restoring workspace packages…");
  try {
    const mat = materializeWorkspaceSymlinks(managedDir, { force: true });
    onProgress?.(
      `Materialized ${mat.materialized.length} package(s)` +
        (mat.missingSource.length
          ? `; missing source: ${mat.missingSource.join(", ")}`
          : "") +
        (Object.keys(mat.errors).length
          ? `; errors: ${Object.keys(mat.errors).join(", ")}`
          : ""),
    );
  } catch (err: any) {
    onProgress?.(`Materialize warning: ${err?.message ?? err}`);
  }

  return {
    ok: true,
    wiped: wipedActual,
    preserved: plan.preserve,
  };
}

/**
 * Pure helper for tests / Doctor's audit panel: render the plan as
 * human-readable text. Not used by the runtime path.
 */
export function formatPlanSummary(plan: SafeWipePlan): string {
  const lines: string[] = [];
  lines.push(`Will wipe (${plan.wipe.length}):`);
  for (const p of plan.wipe) lines.push(`  - ${p}`);
  lines.push(`Will preserve (${plan.preserve.length}):`);
  for (const p of plan.preserve) lines.push(`  - ${p}`);
  return lines.join("\n");
}

// Keep statSync import live for downstream consumers (type guards depend on it).
void statSync;
