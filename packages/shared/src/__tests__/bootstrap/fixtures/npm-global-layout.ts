/**
 * Fixture: global npm install layout.
 *
 * Posix:   /usr/lib/node_modules/<pkg>/...
 * Windows: %APPDATA%\Roaming\npm\node_modules\<pkg>\...
 *          with pi.cmd / openspec.cmd shims in %APPDATA%\Roaming\npm\
 *
 * For the "%ProgramFiles%\nodejs" variant on Windows, see
 * `npmGlobalWindowsProgramFiles` — npm is installed there when users pick
 * "Add to PATH" during Node.js installer.
 */
import posix from "node:path/posix";
import win32 from "node:path/win32";
import type { FsRecord } from "../harness.js";
import { openspecPackageJson, piPackageJson, type PiVersionSpec } from "./pi-versions.js";

interface PosixSpec {
  pi?: PiVersionSpec | false;
  openspec?: string | false;
  /** Install root; defaults to `/usr/lib/node_modules`. */
  root?: string;
  binDir?: string;
}

interface WindowsSpec {
  pi?: PiVersionSpec | false;
  openspec?: string | false;
  dashboard?: boolean;
  /** Where %APPDATA%\Roaming\npm lives. */
  npmDir?: string;
}

/**
 * Unix global npm install. Root defaults to `/usr/lib/node_modules`,
 * binaries at `/usr/local/bin`.
 */
export function npmGlobalUnix(spec: PosixSpec = {}): FsRecord {
  const p = posix;
  const root = spec.root ?? "/usr/lib/node_modules";
  const binDir = spec.binDir ?? "/usr/local/bin";
  const out: Record<string, string> = {};

  if (spec.pi !== false) {
    const piSpec = spec.pi ?? {};
    const piDir = p.join(root, "@mariozechner", "pi-coding-agent");
    out[p.join(piDir, "package.json")] = piPackageJson(piSpec);
    out[p.join(piDir, "dist", "cli.js")] = "#!/usr/bin/env node";
    out[p.join(binDir, "pi")] = "#!/bin/sh\nexec node ...";
  }

  if (spec.openspec !== false) {
    // openspec tool definition uses package `@fission-ai/openspec`
    // with entry `bin/openspec.js` (see definitions.ts).
    const dir = p.join(root, "@fission-ai", "openspec");
    out[p.join(dir, "package.json")] = JSON.stringify({
      name: "@fission-ai/openspec",
      version: spec.openspec ?? "0.4.1",
      bin: { openspec: "bin/openspec.js" },
    });
    out[p.join(dir, "bin", "openspec.js")] = "#!/usr/bin/env node";
    out[p.join(binDir, "openspec")] = "#!/bin/sh\nexec node ...";
  }

  return out;
}

/**
 * Windows AppData\Roaming\npm layout — the default for MSI installs of
 * Node.js. `npmDir` overrides the location.
 */
export function npmGlobalWindowsAppData(
  homedir: string,
  spec: WindowsSpec = {},
): FsRecord {
  const p = win32;
  const npmDir = spec.npmDir ?? p.join(homedir, "AppData", "Roaming", "npm");
  const nodeModules = p.join(npmDir, "node_modules");
  const out: Record<string, string> = {};

  if (spec.pi !== false) {
    const piSpec = spec.pi ?? {};
    const piDir = p.join(nodeModules, "@mariozechner", "pi-coding-agent");
    out[p.join(piDir, "package.json")] = piPackageJson(piSpec);
    out[p.join(piDir, "dist", "cli.js")] = "#!/usr/bin/env node";
    out[p.join(npmDir, "pi.cmd")] = "@node %~dp0\\node_modules\\@mariozechner\\pi-coding-agent\\dist\\cli.js %*";
  }

  if (spec.openspec !== false) {
    const dir = p.join(nodeModules, "@fission-ai", "openspec");
    out[p.join(dir, "package.json")] = JSON.stringify({
      name: "@fission-ai/openspec",
      version: spec.openspec ?? "0.4.1",
      bin: { openspec: "bin/openspec.js" },
    });
    out[p.join(dir, "bin", "openspec.js")] = "#!/usr/bin/env node";
    out[p.join(npmDir, "openspec.cmd")] = "@node %~dp0\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js %*";
  }

  if (spec.dashboard) {
    const dir = p.join(nodeModules, "@blackbelt-technology", "pi-agent-dashboard");
    out[p.join(dir, "package.json")] = JSON.stringify({
      name: "@blackbelt-technology/pi-agent-dashboard",
      version: "0.4.0",
      bin: { "pi-dashboard": "packages/server/dist/cli.js" },
    });
    out[p.join(dir, "packages", "server", "dist", "cli.js")] = "#!/usr/bin/env node";
    out[p.join(npmDir, "pi-dashboard.cmd")] = "@node %~dp0\\node_modules\\@blackbelt-technology\\pi-agent-dashboard\\packages\\server\\dist\\cli.js %*";
  }

  return out;
}

/**
 * Windows %ProgramFiles%\nodejs\node_modules layout — picked when Node
 * installer chose "install as system tool."
 */
export function npmGlobalWindowsProgramFiles(spec: WindowsSpec = {}): FsRecord {
  return npmGlobalWindowsAppData("C:\\Program Files\\nodejs_", {
    ...spec,
    npmDir: "C:\\Program Files\\nodejs",
  });
}
