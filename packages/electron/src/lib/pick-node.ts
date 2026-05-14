/**
 * pick-node.ts — select the Node.js binary used to spawn the dashboard server.
 *
 * Priority order (design D1):
 *   1. Bundled Node  (<app>/Contents/Resources/node/bin/node on POSIX,
 *                     <app>\resources\node\node.exe on Windows)
 *   2. System Node   (from detectSystemNode, already version-gated to ≥ 20.6)
 *   3. execPath fallback — caller MUST set ELECTRON_RUN_AS_NODE=1
 *
 * This is a pure function: all filesystem and platform inputs are injected
 * through PickNodeInput so tests stay free of real I/O.
 */
import path from "node:path";
import { existsSync as fsExistsSync } from "node:fs";

export interface PickNodeInput {
  /** Resolved Resources/node dir, or null in dev env without bundled node. */
  bundledNodeDir: string | null;
  /** Result of detectSystemNode() — already version-gated. */
  systemNode: { found: boolean; path?: string; version?: string };
  /** Injected for testability; production caller passes process.execPath. */
  processExecPath: string;
  /** Injected for testability; production caller passes process.platform. */
  platform: NodeJS.Platform;
  /** Injected for testability; defaults to existsSync from node:fs. */
  existsSync?: (p: string) => boolean;
}

export type PickNodeResult =
  | { kind: "bundled"; nodeBin: string }
  | { kind: "system"; nodeBin: string; version: string }
  | { kind: "execpath-fallback"; nodeBin: string; needsElectronRunAsNode: true };

/**
 * Determine which Node binary to use for spawning the dashboard server.
 *
 * IMPORTANT: this function may reference process.execPath only through
 * the injected `processExecPath` field — this is the sole allowed site
 * per the no-electron-execpath-spawn lint (see pick-node.ts allowlist).
 */
export function pickNodeForServer(input: PickNodeInput): PickNodeResult {
  const { bundledNodeDir, systemNode, processExecPath, platform } = input;
  const fsExists = input.existsSync ?? fsExistsSync;

  // 1. Bundled Node (preferred — zero external dependency)
  if (bundledNodeDir) {
    // Use platform-specific join so tests cross-compiling Windows paths on a
    // POSIX host produce the correct backslash separator.
    const pjoin = platform === "win32" ? path.win32.join : path.posix.join;
    const nodeBin =
      platform === "win32"
        ? pjoin(bundledNodeDir, "node.exe")
        : pjoin(bundledNodeDir, "bin", "node");
    if (fsExists(nodeBin)) {
      return { kind: "bundled", nodeBin };
    }
  }

  // 2. System Node (version-gated by detectSystemNode)
  if (systemNode.found && systemNode.path) {
    return { kind: "system", nodeBin: systemNode.path, version: systemNode.version ?? "" };
  }

  // 3. Last resort: Electron's own binary. Caller stamps ELECTRON_RUN_AS_NODE=1.
  return { kind: "execpath-fallback", nodeBin: processExecPath, needsElectronRunAsNode: true };
}

/**
 * Build the bundledNodeDir path from the app resources path.
 * Used by callers that already have the resources path available.
 */
export function bundledNodeDirFromResources(resourcesPath: string): string {
  return path.join(resourcesPath, "node");
}
