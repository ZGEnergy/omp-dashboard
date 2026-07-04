/**
 * The RPC keeper's OWN launch argv `[nodeBinary, keeper.cjs]` must carry
 * `ELECTRON_RUN_AS_NODE=1` when `nodeBinary` is the Electron GUI binary
 * (the `execpath-fallback` topology) — independently of the pi argv.
 *
 * Guards against the keeper process itself re-launching the Electron GUI
 * and exiting on the single-instance lock.
 *
 * See change: fix-nodescript-argv-electron-execpath-fallback.
 */

import type {
  SpawnDetachedOptions,
  SpawnDetachedResult,
} from "@blackbelt-technology/pi-dashboard-shared/platform/detached-spawn.js";
import { afterEach, describe, expect, it } from "vitest";
import { createKeeperManager } from "../keeper-manager.js";

function withElectronVersion<T>(version: string | undefined, fn: () => T): T {
  const orig = Object.getOwnPropertyDescriptor(process.versions, "electron");
  Object.defineProperty(process.versions, "electron", { value: version, configurable: true });
  try {
    return fn();
  } finally {
    if (orig) Object.defineProperty(process.versions, "electron", orig);
    else delete (process.versions as { electron?: string }).electron;
  }
}

describe("keeper own-spawn ELECTRON_RUN_AS_NODE", () => {
  afterEach(() => {
    // Ensure no lingering electron stub.
    delete (process.versions as { electron?: string }).electron;
  });

  async function captureSpawn(nodeBinary: string, electronVersion?: string) {
    let captured: SpawnDetachedOptions | undefined;
    const spawnDetached = async (opts: SpawnDetachedOptions): Promise<SpawnDetachedResult> => {
      captured = opts;
      return { ok: true, pid: 4242, process: undefined };
    };
    const km = createKeeperManager({ nodeBinary, spawnDetached });
    // Run the spawn under the stubbed electron version.
    await withElectronVersion(electronVersion, async () => {
      await km.spawnKeeperFor("sid-test", process.cwd(), { PATH: process.env.PATH }, ["--mode", "rpc"], [
        nodeBinary,
        "/abs/cli.js",
      ]);
    });
    return captured;
  }

  it("sets the flag when nodeBinary is process.execPath under Electron", async () => {
    const captured = await captureSpawn(process.execPath, "30.0.0");
    expect(captured?.env?.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("does NOT set the flag for a real (non-execPath) node binary", async () => {
    const captured = await captureSpawn("/opt/node/bin/node", "30.0.0");
    expect(captured?.env?.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it("does NOT set the flag when not running under Electron", async () => {
    const captured = await captureSpawn(process.execPath, undefined);
    expect(captured?.env?.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });
});
