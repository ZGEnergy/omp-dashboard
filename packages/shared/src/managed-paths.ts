/**
 * Shared constants + getters for the managed install directory
 * (`~/.omp-dashboard/`) and host agent settings path.
 * Single source of truth — all packages import from here.
 *
 * Constants (MANAGED_DIR, MANAGED_BIN, PI_SETTINGS_PATH) reflect the live
 * environment at module-load time. Production code continues to use them.
 *
 * Getters accept an optional `{ homedir }` override so tests (and the
 * bootstrap harness) can reason about alternate HOME directories without
 * mutating globals.
 *
 * Path names come from {@link getHostProfile} so forever-delta stays
 * concentrated in one module.
 */
import {
  getAgentSettingsPath,
  getHostManagedBin,
  getHostManagedDir,
  type HostPathsEnv,
} from "./host-profile.js";

/** Env override surface used by the getters (subset of PlatformEnv). */
export type ManagedPathsEnv = HostPathsEnv;

/** Root directory for managed installs (omp, openspec, tsx). */
export function getManagedDir(env?: ManagedPathsEnv): string {
  return getHostManagedDir(env);
}

/** Bin directory for managed install executables. */
export function getManagedBin(env?: ManagedPathsEnv): string {
  return getHostManagedBin(env);
}

/** Path to Oh My Pi's global settings file (`~/.omp/agent/settings.json`). */
export function getPiSettingsPath(env?: ManagedPathsEnv): string {
  return getAgentSettingsPath(env);
}

/** Root directory for managed installs (omp, openspec, tsx). */
export const MANAGED_DIR = getManagedDir();

/** Bin directory for managed install executables. */
export const MANAGED_BIN = getManagedBin();

/** Path to Oh My Pi's global settings file. */
export const PI_SETTINGS_PATH = getPiSettingsPath();
