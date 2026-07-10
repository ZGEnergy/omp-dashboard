/**
 * Unit tests for `host-profile.ts` — pure host constants + path math.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAgentDbPath,
  getAgentHome,
  getAgentRoot,
  getAgentSettingsPath,
  getDefaultPluginsDir,
  getDefaultSessionsDir,
  getHostDashboardConfigDir,
  getHostManagedBin,
  getHostManagedDir,
  getHostProfile,
  getProjectLocalDir,
  readPackageManifest,
} from "../host-profile.js";

describe("host-profile", () => {
  const HOME = "/fake/home";
  const env = { homedir: HOME };

  it("exposes OMP constants", () => {
    const p = getHostProfile();
    expect(p.agentRootName).toBe(".omp");
    expect(p.managedInstallDirName).toBe(".omp-dashboard");
    expect(p.cliBinaryName).toBe("omp");
    expect(p.manifestKey).toBe("omp");
    expect(p.manifestFallbackKey).toBe("pi");
    expect(p.codingAgentPackageScopes).toContain("@oh-my-pi/pi-coding-agent");
    expect(p.codingAgentCliEntry).toBe("dist/cli.js");
    expect(p.agentDirEnvName).toBe("PI_CODING_AGENT_DIR");
    expect(p.sessionDirEnvName).toBe("PI_CODING_AGENT_SESSION_DIR");
  });

  it("builds agent + dashboard + managed paths from injected homedir", () => {
    expect(getAgentRoot(env)).toBe(path.join(HOME, ".omp"));
    expect(getAgentHome(env)).toBe(path.join(HOME, ".omp", "agent"));
    expect(getAgentSettingsPath(env)).toBe(
      path.join(HOME, ".omp", "agent", "settings.json"),
    );
    expect(getDefaultSessionsDir(env)).toBe(
      path.join(HOME, ".omp", "agent", "sessions"),
    );
    expect(getHostDashboardConfigDir(env)).toBe(path.join(HOME, ".omp", "dashboard"));
    expect(getHostManagedDir(env)).toBe(path.join(HOME, ".omp-dashboard"));
    expect(getHostManagedBin(env)).toBe(
      path.join(HOME, ".omp-dashboard", "node_modules", ".bin"),
    );
    expect(getDefaultPluginsDir(env)).toBe(path.join(HOME, ".omp", "plugins"));
    expect(getAgentDbPath(env)).toBe(path.join(HOME, ".omp", "agent", "agent.db"));
  });

  it("getProjectLocalDir attaches .omp to cwd", () => {
    expect(getProjectLocalDir("/ws/repo")).toBe(path.join("/ws/repo", ".omp"));
  });

  describe("readPackageManifest", () => {
    it("prefers omp over pi", () => {
      expect(
        readPackageManifest({
          omp: { extensions: ["a"] },
          pi: { extensions: ["b"] },
        }),
      ).toEqual({ extensions: ["a"] });
    });
    it("falls back to pi when omp missing", () => {
      expect(readPackageManifest({ pi: { name: "x" } })).toEqual({ name: "x" });
    });
    it("returns undefined when neither present", () => {
      expect(readPackageManifest({ name: "pkg" })).toBeUndefined();
      expect(readPackageManifest(undefined)).toBeUndefined();
    });
  });
});
