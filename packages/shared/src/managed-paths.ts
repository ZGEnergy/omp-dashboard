/**
 * Shared constants + getters for the managed install directory (~/.pi-dashboard/).
 * Single source of truth — all packages import from here.
 *
 * Constants (MANAGED_DIR, MANAGED_BIN, PI_SETTINGS_PATH) reflect the live
 * environment at module-load time. Production code continues to use them.
 *
 * Getters (getManagedDir, getManagedBin, getPiSettingsPath) accept an
 * optional `{ homedir }` override so tests (and the bootstrap harness)
 * can reason about alternate HOME directories without mutating globals.
 */
import path from "node:path";
import os from "node:os";
import { existsSync as fsExistsSync } from "node:fs";

/** Env override surface used by the getters (subset of PlatformEnv). */
export interface ManagedPathsEnv {
  homedir?: string;
}

/** Root directory for managed installs (pi, openspec, tsx). */
export function getManagedDir(env?: ManagedPathsEnv): string {
  return path.join(env?.homedir ?? os.homedir(), ".pi-dashboard");
}

/** Bin directory for managed install executables. */
export function getManagedBin(env?: ManagedPathsEnv): string {
  return path.join(getManagedDir(env), "node_modules", ".bin");
}

/** Path to pi's global settings file. */
export function getPiSettingsPath(env?: ManagedPathsEnv): string {
  return path.join(env?.homedir ?? os.homedir(), ".pi", "agent", "settings.json");
}

/** Root directory for managed installs (pi, openspec, tsx). */
export const MANAGED_DIR = getManagedDir();

/** Bin directory for managed install executables. */
export const MANAGED_BIN = getManagedBin();

/** Path to pi's global settings file. */
export const PI_SETTINGS_PATH = getPiSettingsPath();

/**
 * Marker file written into the managed install root by `bundle-server.mjs`.
 * Used by `resolveManagedDirRoot` to identify the managed dir from any
 * descendant path.
 */
const MANAGED_VERSION_FILE = ".version";

/**
 * Walk up from `startDir` looking for a `.version` file — the marker that
 * `bundle-server.mjs` writes into the managed install root.
 *
 * Returns the directory *containing* `.version`, or `null` if no such
 * directory is found before reaching the filesystem root.
 *
 * Used by the dashboard server's static-client resolution chain to find
 * the bundled client at `<managedDir>/packages/dist/client/`, independent
 * of whether the workspace symlink materialization in
 * `node_modules/@blackbelt-technology/pi-dashboard-web/` is intact.
 * See change: streamline-electron-bootstrap-and-recovery (Failure 2).
 *
 * Boundary semantics: when `startDir` itself is the managed dir (i.e. the
 * `.version` file is a sibling of `startDir`'s contents), the function
 * returns `startDir` because the walk starts there and `.version` is
 * already present.
 *
 * `accessSync` is injected for tests; defaults to `node:fs`'s sync access.
 */
export function resolveManagedDirRoot(
  startDir: string,
  opts?: { existsSync?: (p: string) => boolean },
): string | null {
  const existsSync = opts?.existsSync ?? defaultExistsSync;
  let cur = path.resolve(startDir);
  let last = "";
  // path.dirname of root returns the root itself — use that as the stop.
  while (cur !== last) {
    if (existsSync(path.join(cur, MANAGED_VERSION_FILE))) return cur;
    last = cur;
    cur = path.dirname(cur);
  }
  return null;
}

function defaultExistsSync(p: string): boolean {
  return fsExistsSync(p);
}
