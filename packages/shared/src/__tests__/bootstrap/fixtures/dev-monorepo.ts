/**
 * Fixture: dev monorepo layout (what developers see running from source).
 *
 * <root>/
 *   node_modules/
 *     @earendil-works/pi-coding-agent/dist/cli.js
 *     openspec/dist/cli.js
 *     tsx/dist/cli.mjs
 *   packages/
 *     shared/    server/    extension/    electron/
 *
 * Used for Family C scenarios (bare-import resolves pi via workspace
 * node_modules).
 */
import posix from "node:path/posix";
import win32 from "node:path/win32";
import type { FsRecord } from "../harness.js";
import { openspecPackageJson, piPackageJson, type PiVersionSpec } from "./pi-versions.js";

export interface DevMonorepoSpec {
  root: string;
  platform: NodeJS.Platform;
  pi?: PiVersionSpec;
  openspec?: string;
}

export function devMonorepo(spec: DevMonorepoSpec): FsRecord {
  const p = spec.platform === "win32" ? win32 : posix;
  const nodeModules = p.join(spec.root, "node_modules");
  const out: Record<string, string> = {};

  // Root package.json (workspace)
  out[p.join(spec.root, "package.json")] = JSON.stringify({
    name: "pi-agent-dashboard-root",
    private: true,
    workspaces: ["packages/*"],
  });

  // Workspace packages
  for (const pkg of ["shared", "server", "extension", "electron", "client"]) {
    out[p.join(spec.root, "packages", pkg, "package.json")] = JSON.stringify({
      name: `@blackbelt-technology/pi-dashboard-${pkg}`,
      version: "0.4.0",
    });
  }

  // Hoisted deps
  const piDir = p.join(nodeModules, "@mariozechner", "pi-coding-agent");
  out[p.join(piDir, "package.json")] = piPackageJson(spec.pi);
  out[p.join(piDir, "dist", "cli.js")] = "#!/usr/bin/env node";

  const osDir = p.join(nodeModules, "openspec");
  out[p.join(osDir, "package.json")] = openspecPackageJson(spec.openspec ?? "0.4.1");
  out[p.join(osDir, "dist", "cli.js")] = "#!/usr/bin/env node";
  out[p.join(osDir, "dist", "index.js")] = "module.exports = {};";

  return out;
}
