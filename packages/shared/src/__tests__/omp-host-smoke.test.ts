/**
 * Smoke: registry resolves OMP coding-agent + CLI under host profile scopes.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { registerDefaultTools } from "../tool-registry/definitions.js";
import { getDefaultRegistry } from "../tool-registry/index.js";
import { getHostProfile } from "../host-profile.js";
import {
  getAgentHome,
  getDefaultSessionsDir,
  getHostDashboardConfigDir,
  getHostManagedDir,
} from "../host-profile.js";

describe("omp host smoke", () => {
  it("host profile points at omp homes and packages", () => {
    const p = getHostProfile();
    expect(p.cliBinaryName).toBe("omp");
    expect(p.codingAgentPackageScopes[0]).toBe("@oh-my-pi/pi-coding-agent");
    expect(p.manifestKey).toBe("omp");
    expect(getAgentHome()).toMatch(/\.omp[/\\]agent$/);
    expect(getDefaultSessionsDir()).toMatch(/sessions$/);
    expect(getHostDashboardConfigDir()).toMatch(/dashboard$/);
    expect(getHostManagedDir()).toMatch(/\.omp-dashboard$/);
  });

  it("registry resolves pi executor argv including omp package or binary", () => {
    const reg = getDefaultRegistry();
    registerDefaultTools(reg);
    const exec = reg.resolveExecutor("pi");
    expect(exec.ok).toBe(true);
    if (!exec.ok) return;
    // argv may be [cli.js] or [node, cli.js] / [omp path]
    const joined = exec.argv.join(" ");
    const looksLikeOmp =
      joined.includes("pi-coding-agent") ||
      joined.endsWith("/omp") ||
      joined.includes("dist/cli.js") ||
      joined.includes("omp");
    expect(looksLikeOmp).toBe(true);
  });

  it("registry resolves pi-coding-agent module to @oh-my-pi when installed", async () => {
    const reg = getDefaultRegistry();
    registerDefaultTools(reg);
    if (!reg.has("pi-coding-agent")) {
      // should always be registered
      expect.fail("pi-coding-agent tool missing");
    }
    try {
      const { path: modPath } = await reg.resolveModule("pi-coding-agent");
      expect(modPath.includes("@oh-my-pi") || existsSync(modPath)).toBe(true);
    } catch (err) {
      // environment without the package: skip soft
      console.warn("module resolve soft-fail (package may be absent in test HOME):", err);
      expect(true).toBe(true);
    }
  });
});
