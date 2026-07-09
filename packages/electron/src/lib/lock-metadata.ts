/**
 * Read the per-HOME dashboard lock metadata sidecar.
 *
 * Inlined (rather than imported from @blackbelt-technology/pi-dashboard-server)
 * because the Electron runtime can't rely on shared-pkg resolution — mirrors
 * the pattern already used for `health-check.ts` in this package.
 *
 * See change: single-dashboard-per-home.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DashboardLockMetadata {
  pid: number;
  httpPort: number;
  piPort: number;
  startedAt: number;
  identity: string;
  version: string;
  url: string;
  hostname: string;
}

/**
 * Mirrors `packages/server/src/home-lock.ts::canonicalHomedir` exactly — uses
 * `os.userInfo().homedir` (immune to `$HOME` on POSIX) with `os.homedir()`
 * fallback, then `fs.realpathSync`. Both readers and the server writer MUST
 * agree on this function or the Electron dialog will miss dashboards.
 */
function canonicalHomedir(): string {
  let raw: string;
  try { raw = os.userInfo().homedir; } catch { raw = os.homedir(); }
  try { return fs.realpathSync(raw); } catch { return raw; }
}

export function getLockMetaPath(): string {
  return path.join(canonicalHomedir(), ".omp", "dashboard", "server.lock.meta.json");
}

/**
 * Read the lock metadata sidecar. Returns null on missing / corrupt / perm.
 */
export function readDashboardLockMetadata(metaPath: string = getLockMetaPath()): DashboardLockMetadata | null {
  try {
    const raw = fs.readFileSync(metaPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const m = parsed as Record<string, unknown>;
    if (
      typeof m.pid === "number" &&
      typeof m.httpPort === "number" &&
      typeof m.identity === "string" &&
      typeof m.url === "string"
    ) {
      return m as unknown as DashboardLockMetadata;
    }
    return null;
  } catch {
    return null;
  }
}
