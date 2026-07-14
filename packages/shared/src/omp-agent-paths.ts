/**
 * Resolve the OMP agent config root (`~/.omp/agent` by default).
 *
 * Mirrors the tilde-expand / blank-as-unset style of `dashboard-paths.ts`
 * so tests can re-root via `{ homedir, agentDirEnv }` without mutating
 * `os.homedir()` or process env.
 */

import os from "node:os";
import path from "node:path";

export type OmpAgentPathsEnv = {
  /** Override for `os.homedir()`. */
  homedir?: string;
  /** Injected `process.env.PI_CODING_AGENT_DIR` (test seam). */
  agentDirEnv?: string;
};

/** Expand a leading `~/` against `env.homedir` (or `os.homedir()`). */
function expandTilde(p: string, env?: OmpAgentPathsEnv): string {
  if (p === "~") return env?.homedir ?? os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(env?.homedir ?? os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Resolve the OMP agent directory that holds `config.yml`.
 *
 * Precedence:
 *   1. `env.agentDirEnv` / `process.env.PI_CODING_AGENT_DIR` (trimmed; blank = unset)
 *   2. `~/.omp/agent`
 *
 * Leading `~/` expands against `homedir`; absolute paths pass through.
 */
export function resolveOmpAgentDir(env?: OmpAgentPathsEnv): string {
  const raw = (env?.agentDirEnv ?? process.env.PI_CODING_AGENT_DIR)?.trim();
  if (raw) return expandTilde(raw, env);
  return path.join(env?.homedir ?? os.homedir(), ".omp", "agent");
}

/** `config.yml` under the resolved agent dir. */
export function resolveOmpConfigYml(env?: OmpAgentPathsEnv): string {
  return path.join(resolveOmpAgentDir(env), "config.yml");
}
