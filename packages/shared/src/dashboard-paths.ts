/**
 * Single source of truth for filesystem paths the dashboard touches at runtime.
 *
 * Why this file exists
 * --------------------
 * Two distinct directories were historically conflated by `~/`-anchored
 * `path.join` calls scattered across packages:
 *
 *   ~/.omp/dashboard/   — config + the *server* log (`server.log`)
 *   ~/.omp-dashboard/   — the *managed* install dir (npm packages, etc.)
 *                        Older bootstrap code also wrote an *installer*
 *                        log to a sibling managed dir `server.log` (note:
 *                        same filename, different dir). That file is now
 *                        legacy/dead in the V2 launch path.
 *
 * Loading-page recovery surfaced this on 2026-05-17: the IPC handler
 * read the managed installer log while the live server wrote to the
 * dashboard config dir log.
 *
 * All path math lives here. Every $HOME override goes through `env.homedir`
 * so tests can re-root without mutating `os.homedir()`. Host names come
 * from {@link getHostProfile}.
 *
 * See change: harvest-bootstrap-survivor-fixes (cherry-pick 1).
 */

import os from "node:os";
import path from "node:path";
import {
  getDefaultSessionsDir,
  getHostDashboardConfigDir,
  getHostProfile,
} from "./host-profile.js";
import {
  getManagedDir as getManagedDirInternal,
  type ManagedPathsEnv,
} from "./managed-paths.js";

/**
 * Shared env override surface. `homedir` mirrors `ManagedPathsEnv`; the
 * remaining fields are inputs to {@link resolvePiSessionsDir} only — the
 * other path getters ignore them.
 */
export type DashboardPathsEnv = ManagedPathsEnv & {
  /** `config.json#piSessionsDir` — operator's explicit dashboard override. */
  piSessionsDir?: string;
  /** Injected session-dir env value (test seam; live: PI_CODING_AGENT_SESSION_DIR). */
  sessionDirEnv?: string;
  /** Injected agent-dir env value (test seam; live: PI_CODING_AGENT_DIR). */
  agentDirEnv?: string;
};

/** Expand a leading `~/` against `env.homedir` (or `os.homedir()`). */
function expandTilde(p: string, env?: DashboardPathsEnv): string {
  if (p === "~") return env?.homedir ?? os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(env?.homedir ?? os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Resolve the host sessions root the dashboard scans. Precedence:
 *   1. `config.json#piSessionsDir`            (highest)
 *   2. session dir env (`PI_CODING_AGENT_SESSION_DIR` on live OMP)
 *   3. agent dir env (`PI_CODING_AGENT_DIR`) + `/sessions`
 *   4. literal `~/.omp/agent/sessions`         (last-ditch)
 * Each string layer is trimmed; whitespace-only is treated as unset and
 * falls through. Leading `~/` expands against `homedir`; absolute paths pass
 * through untouched.
 *
 * Layer 3 mirrors OMP/pi-core's sessions dir (= agentDir/sessions)
 * without importing the package: the published `.d.ts` barrel re-exports
 * via `./config.ts` specifiers that this project's `moduleResolution: bundler`
 * (no `allowImportingTsExtensions`) cannot value-import. Reading the env
 * var names from host profile keeps `shared` dependency-light and tsc-clean.
 */
export function resolvePiSessionsDir(env?: DashboardPathsEnv): string {
  const profile = getHostProfile();
  const pick = (s?: string): string | undefined => {
    const t = s?.trim();
    return t ? expandTilde(t, env) : undefined;
  };
  const agentDir = pick(env?.agentDirEnv ?? process.env[profile.agentDirEnvName]);
  return (
    pick(env?.piSessionsDir) ??
    pick(env?.sessionDirEnv ?? process.env[profile.sessionDirEnvName]) ??
    (agentDir ? path.join(agentDir, "sessions") : undefined) ??
    getDefaultSessionsDir(env)
  );
}

/** `~/.omp/dashboard/` — config dir for `config.json`, `server.log`, etc. */
export function getDashboardConfigDir(env?: DashboardPathsEnv): string {
  return getHostDashboardConfigDir(env);
}

/** `~/.omp/dashboard/server.log` — the live dashboard server's stdout/stderr log. */
export function getDashboardServerLogPath(env?: DashboardPathsEnv): string {
  return path.join(getDashboardConfigDir(env), "server.log");
}

/**
 * `~/.omp/dashboard/first-run-done` — sentinel file written by the Electron
 * wizard on completion. Presence means the one-step welcome was shown and
 * acknowledged; subsequent launches skip the wizard.
 *
 * Lives under the dashboard config dir (not the managed install dir) so it
 * survives Electron whole-app updates and remains the same path across
 * all install layouts.
 *
 * See change: eliminate-electron-runtime-install (Q2 ratification).
 */
export function getFirstRunMarkerPath(env?: DashboardPathsEnv): string {
  return path.join(getDashboardConfigDir(env), "first-run-done");
}

/** `~/.omp-dashboard/` — managed-install root (npm packages, etc.). Re-export. */
export function getManagedDir(env?: DashboardPathsEnv): string {
  return getManagedDirInternal(env);
}

/**
 * Managed-dir `server.log` — the legacy *installer* log. Distinct from
 * the server log; left here so callers can be explicit about which file
 * they want and the grep tooling has a single canonical reference.
 */
export function getInstallerLogPath(env?: DashboardPathsEnv): string {
  return path.join(getManagedDir(env), "server.log");
}
