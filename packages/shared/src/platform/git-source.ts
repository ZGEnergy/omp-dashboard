/**
 * Process-lifetime git-source state + env augmentation entrypoint.
 *
 * Holds the configured `windowsGitSource` setting and a cached resolution
 * ({ source, gitDir }) computed once per process (probing host PATH is
 * the expensive part). The server seeds the setting at startup and
 * invalidates on config-write; `/api/restart` is a fresh process so the
 * cache resets for free.
 *
 * `augmentEnvWithGitSource` is the single call wired into the spawn-env
 * chokepoint (`ToolResolver.buildSpawnEnv`) and the PTY path. `which` is
 * injected by the caller to avoid a binary-lookup ↔ git-source import
 * cycle.
 *
 * See change: embed-git-bash-on-windows.
 */
import {
  selectGitSource,
  type GitSource,
  type WindowsGitSourceSetting,
} from "./select-git-source.js";
import {
  ensureBundledGitOnPath,
  resolveBundledGitDir,
} from "./ensure-bundled-git.js";
import { spawnSync } from "./exec.js";
import path from "node:path";

export type WhichFn = (cmd: string) => string | null;

export interface ActiveGitSource {
  source: GitSource;
  setting: WindowsGitSourceSetting;
  /** Bundled git root when source is "bundled" and present, else null. */
  gitDir: string | null;
}

let configuredSetting: WindowsGitSourceSetting = "auto";
let cached: ActiveGitSource | null = null;

/** Seed the configured setting (server reads it from DashboardConfig). */
export function setWindowsGitSourceSetting(setting: WindowsGitSourceSetting): void {
  if (setting !== configuredSetting) {
    configuredSetting = setting;
    invalidateGitSourceCache(); // resets BOTH cached + readoutCache
  }
}

/** Drop the cached resolution (config-write, manual re-check). */
export function invalidateGitSourceCache(): void {
  cached = null;
  readoutCache = null;
}

export interface GitSourceResolveOpts {
  /** Override `process.resourcesPath` for tests / standalone bundles. */
  resourcesPath?: string;
  candidates?: string[];
}

/**
 * Resolve (and cache) the active git source for this process. `which`
 * probes host PATH (only consulted on Windows + non-"bundled" settings).
 */
export function getActiveGitSource(which: WhichFn, opts: GitSourceResolveOpts = {}): ActiveGitSource {
  if (cached) return cached;
  const source = selectGitSource({ setting: configuredSetting, which });
  const gitDir =
    source === "bundled"
      ? resolveBundledGitDir({
          resourcesPath: opts.resourcesPath ?? (process as { resourcesPath?: string }).resourcesPath,
          candidates: opts.candidates,
        })
      : null;
  cached = { source, setting: configuredSetting, gitDir };
  return cached;
}

/**
 * Augment a spawn env with bundled git/sh when the active source is
 * "bundled". No-op on non-Windows, host source, or absent bundle.
 * Defensive: a probe failure never breaks spawning — returns env as-is.
 */
export function augmentEnvWithGitSource(
  env: NodeJS.ProcessEnv,
  which: WhichFn,
  opts: GitSourceResolveOpts = {},
): NodeJS.ProcessEnv {
  try {
    const { source, gitDir } = getActiveGitSource(which, opts);
    return ensureBundledGitOnPath(env, { source, gitDir });
  } catch {
    return env;
  }
}

export interface GitSourceReadout {
  setting: WindowsGitSourceSetting;
  source: GitSource;
  /** Resolved git.exe path (bundled or host), or null. */
  gitPath: string | null;
  /** `git --version` output, or null when unresolved. */
  gitVersion: string | null;
  /** Resolved POSIX shell path (bundled usr/bin/sh.exe or host), or null. */
  shellPath: string | null;
}

let readoutCache: GitSourceReadout | null = null;

function probeVersion(gitPath: string): string | null {
  try {
    const r = spawnSync<string>(gitPath, ["--version"], { encoding: "utf8", timeout: 5000 });
    return r.status === 0 ? (r.stdout || "").trim() || null : null;
  } catch {
    return null;
  }
}

/**
 * Windows-only diagnostic readout for /api/health + Diagnostics. Returns
 * null on macOS/Linux (the setting is a no-op there). Cached for the life
 * of the process; reset by invalidateGitSourceCache().
 */
export function getGitSourceReadout(which: WhichFn, opts: GitSourceResolveOpts = {}): GitSourceReadout | null {
  if (process.platform !== "win32") return null;
  if (readoutCache) return readoutCache;
  const { source, setting, gitDir } = getActiveGitSource(which, opts);
  let gitPath: string | null = null;
  let shellPath: string | null = null;
  if (source === "bundled" && gitDir) {
    gitPath = path.win32.join(gitDir, "cmd", "git.exe");
    shellPath = path.win32.join(gitDir, "usr", "bin", "sh.exe");
  } else {
    gitPath = which("git");
    shellPath = which("bash") ?? which("sh");
  }
  readoutCache = {
    setting,
    source,
    gitPath,
    gitVersion: gitPath ? probeVersion(gitPath) : null,
    shellPath,
  };
  return readoutCache;
}
