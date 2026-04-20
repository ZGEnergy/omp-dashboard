/**
 * Dashboard server health check.
 * Extracted from server-lifecycle.ts so both main.ts and server-lifecycle.ts can use it.
 *
 * NOTE: This module must NOT import from @blackbelt-technology/pi-dashboard-shared.
 * In the packaged Electron app, those packages are not on the ESM module resolution path.
 */

export interface DashboardStatus {
  running: boolean;
  pid?: number;
  version?: string;
  /** Server mode ("dev" / "production") when the health endpoint reports it. */
  mode?: string;
  portConflict?: boolean;
}

/**
 * Check if the dashboard server is running on the given port.
 * Uses a 2-second timeout. ECONNREFUSED returns immediately.
 */
export async function isDashboardRunning(port: number): Promise<DashboardStatus> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return { running: false, portConflict: true };

    const data = await res.json() as Record<string, unknown>;
    if (data && data.ok === true && typeof data.pid === "number") {
      const version = typeof data.version === "string" ? data.version : undefined;
      const mode = typeof data.mode === "string" ? data.mode : undefined;
      return { running: true, pid: data.pid, version, mode };
    }
    // HTTP 200 but not our format — another service on this port
    return { running: false, portConflict: true };
  } catch (err: any) {
    if (err?.cause?.code === "ECONNREFUSED") {
      return { running: false };
    }
    // Timeout or network error — port might be in use
    return { running: false };
  }
}
