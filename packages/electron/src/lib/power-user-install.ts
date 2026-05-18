/**
 * Every-launch startup-action decision.
 *
 * After the slimmed wizard ships (change: streamline-electron-bootstrap-and-recovery,
 * Group 8) the wizard trigger is purely filesystem-derived:
 *   - managed dir empty   → run the wizard
 *   - managed dir present → preflight may still want a selective reinstall
 *   - otherwise           → skip both surfaces and launch the dashboard
 *
 * `decideStartupAction` is a pure helper exercised by unit tests; the
 * launch code in `main.ts` consumes its verdict.
 *
 * `isManagedDirPopulated` is the filesystem replacement for the deleted
 * `mode.json`-based `isFirstRun`: every required Electron-owned package's
 * `package.json` must exist under `<managedDir>/node_modules/` and parse.
 */
import { MANAGED_DIR } from "./managed-paths.js";
import { ELECTRON_OWNED_PACKAGES } from "@blackbelt-technology/pi-dashboard-shared/managed-package-whitelist.js";
import { isPackageInstalledOnDisk } from "@blackbelt-technology/pi-dashboard-shared/managed-package-detect.js";

/**
 * Idempotency probe: returns true when every Electron-owned package's
 * `package.json` is present under `<managedDir>/node_modules/` AND parses
 * as JSON. Pure I/O, no spawn. Used as the replacement for the deleted
 * `wizard-state.ts::isFirstRun`.
 *
 * Delegates to the shared `isPackageInstalledOnDisk` helper which uses
 * direct `fs.existsSync` rather than `require.resolve` — the latter
 * fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` against packages with
 * restrictive `exports` maps even when their `package.json` is fully
 * present, causing the wizard to re-fire on every launch.
 *
 * Source of truth for the package set is
 * `@blackbelt-technology/pi-dashboard-shared/managed-package-whitelist`.
 *
 * See change: fix-is-npm-package-installed-exports-map.
 */
export function isManagedDirPopulated(managedDir: string = MANAGED_DIR): boolean {
  for (const pkg of ELECTRON_OWNED_PACKAGES) {
    if (!isPackageInstalledOnDisk(pkg, managedDir)) return false;
  }
  return true;
}

/** Pure inputs for the every-launch startup-action decision. */
export interface StartupState {
  /** True when pi-coding-agent is found on PATH or in pi's standard locations. */
  piFound: boolean;
  /** True when the dashboard bridge is registered in pi's `settings.json`. */
  bridgeFound: boolean;
  /** True when every Electron-owned package is installed in the managed dir. */
  managedPopulated: boolean;
  /** True when `runPreflight` reports `needsAction: true`. */
  preflightNeedsAction: boolean;
}

/** Pure result describing what the Electron main flow should do. */
export type StartupAction =
  | { kind: "skip" }
  | { kind: "preflight-install" }
  | { kind: "wizard" };

/**
 * Decide what the Electron main process should do at startup based on
 * pure detection state. No I/O; no side effects.
 *
 * Rules (in priority order):
 *   1. Managed dir empty                   → wizard
 *   2. Preflight reports an action needed  → preflight-install
 *   3. Otherwise                            → skip (launch dashboard directly)
 *
 * `piFound` / `bridgeFound` are accepted for symmetry with the old
 * signature and to ease logging at call sites; they do NOT affect the
 * decision in the slimmed model (the wizard's job is only to populate
 * `~/.pi-dashboard/node_modules/`, not to gate on system pi presence).
 */
export function decideStartupAction(state: StartupState): StartupAction {
  if (!state.managedPopulated) return { kind: "wizard" };
  if (state.preflightNeedsAction) return { kind: "preflight-install" };
  return { kind: "skip" };
}
