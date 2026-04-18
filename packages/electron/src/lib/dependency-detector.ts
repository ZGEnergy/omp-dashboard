/**
 * Detects whether required CLI tools are installed.
 * Checks system PATH first, then the managed install at ~/.pi-dashboard/.
 */
import { execSync } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import * as npm from "@blackbelt-technology/pi-dashboard-shared/platform/npm.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { MANAGED_DIR, MANAGED_BIN } from "./managed-paths.js";
import { ToolResolver } from "@blackbelt-technology/pi-dashboard-shared/platform/binary-lookup.js";

// Shared platform primitive handles where/which + managed-bin + login-shell.
// Single cached instance — `ToolResolver` is stateless beyond its ctx object.
// See change: consolidate-platform-handlers (Section 10).
const resolver = new ToolResolver({
  processExecPath: process.execPath,
  useLoginShell: true,
});

export interface DetectionResult {
  found: boolean;
  path?: string;
  source?: "system" | "managed" | "settings";
}

/**
 * Check system PATH (with login-shell fallback on Unix), then managed install.
 * Uses the shared `ToolResolver` primitive; source-classification is derived
 * from the returned path prefix.
 */
function detect(binaryName: string): DetectionResult {
  const resolved = resolver.which(binaryName);
  if (!resolved) return { found: false };

  // Classify: paths under MANAGED_BIN are "managed", everything else "system".
  const source: DetectionResult["source"] =
    resolved.startsWith(MANAGED_BIN) ? "managed" : "system";
  return { found: true, path: resolved, source };
}

export function detectPi(): DetectionResult {
  return detect("pi");
}

export function detectOpenSpec(): DetectionResult {
  return detect("openspec");
}

export function detectSystemNode(): DetectionResult {
  const nodePath = resolver.which("node");
  if (!nodePath) return { found: false };

  // Check version >= 20.6
  try {
    const version = execSync(`"${nodePath}" --version`, { encoding: "utf-8" }).trim();
    const match = version.match(/^v(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major > 20 || (major === 20 && minor >= 6)) {
        return { found: true, path: nodePath, source: "system" };
      }
    }
  } catch { /* ignore */ }

  return { found: false };
}

export function detectDashboardPackage(): DetectionResult {
  // Check managed install
  const managedPkg = path.join(MANAGED_DIR, "node_modules", "@blackbelt-technology", "pi-agent-dashboard", "package.json");
  if (existsSync(managedPkg)) {
    return { found: true, path: managedPkg, source: "managed" };
  }

  // Check global npm install (shared npm module handles windowsHide + caching).
  const npmRoot = npm.rootGlobalOr("");
  if (npmRoot) {
    const globalPkg = path.join(npmRoot, "@blackbelt-technology", "pi-agent-dashboard", "package.json");
    if (existsSync(globalPkg)) {
      return { found: true, path: globalPkg, source: "system" };
    }
  }

  return { found: false };
}

/**
 * Detect the bridge extension by checking:
 * 1. pi's settings.json packages[] for any entry containing "pi-dashboard"
 * 2. npm package locations (managed + global) as fallback
 */
export function detectBridgeExtension(): DetectionResult {
  // 1. Check pi's settings.json packages array
  const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
  try {
    const settingsExist = existsSync(settingsPath);
    if (settingsExist) {
      const raw = readFileSync(settingsPath, "utf-8").trim();
      if (raw) {
        const data = JSON.parse(raw);
        const packages = Array.isArray(data?.packages) ? data.packages : [];
        for (const entry of packages) {
          if (typeof entry === "string" && (entry.includes("pi-dashboard") || entry.includes("pi-agent-dashboard"))) {
            return { found: true, path: entry, source: "settings" };
          }
        }
      }
    }
  } catch { /* corrupt or unreadable settings */ }

  // 2. Fall back to npm package location checks
  return detectDashboardPackage();
}

/**
 * Detect the pi-dashboard CLI on PATH.
 * Excludes npx cache shims (.npm/_npx/) to avoid matching ephemeral installs.
 */
export function detectPiDashboardCli(): DetectionResult {
  const cliPath = resolver.which("pi-dashboard");
  if (!cliPath) return { found: false };

  // Exclude npx cache paths
  if (cliPath.includes(".npm/_npx") || cliPath.includes(".npm\\_npx")) {
    return { found: false };
  }

  return { found: true, path: cliPath, source: "system" };
}
