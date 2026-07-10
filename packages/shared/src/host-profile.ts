/**
 * Forever host profile for this Oh My Pi dashboard fork.
 *
 * Pure data + pure path helpers. No I/O, package manager, or auth.
 * All OMP constant names (homes, CLI, package scopes, manifest key)
 * live here so shared/server call sites can stay generic.
 *
 * See: docs/plans/omp-host-contract.md, docs/plans/2026-07-10-omp-clean-fork-plan.md
 */
import os from "node:os";
import path from "node:path";

/** Env override surface used by host path helpers. */
export interface HostPathsEnv {
  homedir?: string;
}

/**
 * Immutable host constants for this fork. Dual-host product mode is a
 * non-goal — here `getHostProfile()` always returns OMP values.
 */
export type HostProfile = {
  /** Top-level agent root under HOME, e.g. ".omp". */
  agentRootName: string;
  /** Agent subdir under agent root, e.g. "agent". */
  agentDirName: string;
  /** Dashboard config subdir under agent root, e.g. "dashboard". */
  dashboardConfigDirName: string;
  /** Managed install dir name under HOME, e.g. ".omp-dashboard". */
  managedInstallDirName: string;
  /** Project-local root under a workspace cwd, e.g. ".omp". */
  projectLocalRootName: string;
  /** CLI binary name on PATH / managed bin, e.g. "omp". */
  cliBinaryName: string;
  /** Package names tried when resolving the coding-agent install. */
  codingAgentPackageScopes: readonly string[];
  /** Package names tried for pi-ai. */
  aiPackageScopes: readonly string[];
  /** Package names tried for pi-tui. */
  tuiPackageScopes: readonly string[];
  /** Package names tried for pi-agent-core. */
  agentCorePackageScopes: readonly string[];
  /** Package keywords for extension packaging surfaces. */
  packageKeywords: readonly string[];
  /** package.json manifest field preferred for OMP plugins/extensions. */
  manifestKey: "omp" | "pi";
  /** Fallback package.json manifest field for legacy packages. */
  manifestFallbackKey: "omp" | "pi";
  /** Env prefix for dashboard-owned knobs (OMP_*). */
  envPrefix: string;
  /**
   * Env var OMP still honors for agent-dir override (historically PI_*).
   * Exposed so path resolution can document the live contract without
   * hardcoding the name at every call site.
   */
  agentDirEnvName: string;
  /** Env var for session-dir override (historically PI_*). */
  sessionDirEnvName: string;
  /** relative path of cli entry inside the coding-agent package. */
  codingAgentCliEntry: string;
};

const OMP_HOST_PROFILE: HostProfile = {
  agentRootName: ".omp",
  agentDirName: "agent",
  dashboardConfigDirName: "dashboard",
  managedInstallDirName: ".omp-dashboard",
  projectLocalRootName: ".omp",
  cliBinaryName: "omp",
  codingAgentPackageScopes: ["@oh-my-pi/pi-coding-agent"] as const,
  aiPackageScopes: ["@oh-my-pi/pi-ai"] as const,
  tuiPackageScopes: ["@oh-my-pi/pi-tui"] as const,
  agentCorePackageScopes: ["@oh-my-pi/pi-agent-core"] as const,
  packageKeywords: ["oh-my-pi", "omp", "pi-dashboard"] as const,
  manifestKey: "omp",
  manifestFallbackKey: "pi",
  envPrefix: "OMP",
  // Live OMP still reads the PI_* names for these two overrides.
  agentDirEnvName: "PI_CODING_AGENT_DIR",
  sessionDirEnvName: "PI_CODING_AGENT_SESSION_DIR",
  codingAgentCliEntry: "dist/cli.js",
};

/** Soft-coded host constants for this fork. */
export function getHostProfile(): HostProfile {
  return OMP_HOST_PROFILE;
}

function homeOf(env?: HostPathsEnv): string {
  return env?.homedir ?? os.homedir();
}

/** `~/.omp` */
export function getAgentRoot(env?: HostPathsEnv): string {
  const p = getHostProfile();
  return path.join(homeOf(env), p.agentRootName);
}

/** `~/.omp/agent` */
export function getAgentHome(env?: HostPathsEnv): string {
  const p = getHostProfile();
  return path.join(getAgentRoot(env), p.agentDirName);
}

/** `~/.omp/agent/settings.json` */
export function getAgentSettingsPath(env?: HostPathsEnv): string {
  return path.join(getAgentHome(env), "settings.json");
}

/** `~/.omp/agent/sessions` — last-ditch sessions root. */
export function getDefaultSessionsDir(env?: HostPathsEnv): string {
  return path.join(getAgentHome(env), "sessions");
}

/** `~/.omp/dashboard` */
export function getHostDashboardConfigDir(env?: HostPathsEnv): string {
  const p = getHostProfile();
  return path.join(getAgentRoot(env), p.dashboardConfigDirName);
}

/** `~/.omp-dashboard` — dashboard managed install root. */
export function getHostManagedDir(env?: HostPathsEnv): string {
  const p = getHostProfile();
  return path.join(homeOf(env), p.managedInstallDirName);
}

/** `~/.omp-dashboard/node_modules/.bin` */
export function getHostManagedBin(env?: HostPathsEnv): string {
  return path.join(getHostManagedDir(env), "node_modules", ".bin");
}

/** `<cwd>/.omp` */
export function getProjectLocalDir(cwd: string): string {
  const p = getHostProfile();
  return path.join(cwd, p.projectLocalRootName);
}

/** `~/.omp/plugins` — global plugin storage when no profile override applies. */
export function getDefaultPluginsDir(env?: HostPathsEnv): string {
  return path.join(getAgentRoot(env), "plugins");
}

/** `~/.omp/agent/agent.db` */
export function getAgentDbPath(env?: HostPathsEnv): string {
  return path.join(getAgentHome(env), "agent.db");
}

/**
 * Read package.json manifest preferring `omp`, falling back to `pi`.
 * Pure — accepts already-parsed package.json values.
 */
export function readPackageManifest(
  pkg: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!pkg || typeof pkg !== "object") return undefined;
  const p = getHostProfile();
  const primary = pkg[p.manifestKey];
  if (primary && typeof primary === "object") {
    return primary as Record<string, unknown>;
  }
  const fallback = pkg[p.manifestFallbackKey];
  if (fallback && typeof fallback === "object") {
    return fallback as Record<string, unknown>;
  }
  return undefined;
}
