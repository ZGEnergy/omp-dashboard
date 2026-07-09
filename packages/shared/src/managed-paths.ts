/**
 * Shared constants + getters for the managed install directory (~/.omp-dashboard/).
 * Single source of truth — all packages import from here.
 *
 * Constants (MANAGED_DIR, MANAGED_BIN, OMP_SETTINGS_PATH) reflect the live
 * environment at module-load time. Production code continues to use them.
 *
 * Getters (getManagedDir, getManagedBin, getOmpSettingsPath) accept an
 * optional `{ homedir }` override so tests (and the bootstrap harness)
 * can reason about alternate HOME directories without mutating globals.
 */
import path from "node:path";
import os from "node:os";

/** Env override surface used by the getters (subset of PlatformEnv). */
export interface ManagedPathsEnv {
  homedir?: string;
}

/** Root directory for managed installs (pi, openspec, tsx). */
export function getManagedDir(env?: ManagedPathsEnv): string {
  return path.join(env?.homedir ?? os.homedir(), ".omp-dashboard");
}

/** Bin directory for managed install executables. */
export function getManagedBin(env?: ManagedPathsEnv): string {
  return path.join(getManagedDir(env), "node_modules", ".bin");
}

/** Path to pi's global settings file. */
export function getOmpSettingsPath(env?: ManagedPathsEnv): string {
  return path.join(env?.homedir ?? os.homedir(), ".omp", "agent", "settings.json");
}

/** Root directory for managed installs (pi, openspec, tsx). */
export const MANAGED_DIR = getManagedDir();

/** Bin directory for managed install executables. */
export const MANAGED_BIN = getManagedBin();

/** Path to pi's global settings file. */
export const OMP_SETTINGS_PATH = getOmpSettingsPath();
