/**
 * Server identity verification via HTTP health check.
 * Replaces bare TCP port probes with identity-verified dashboard detection.
 */

const HEALTH_TIMEOUT = 2000;

export interface DashboardStatus {
  /** Whether the dashboard server is running on this port */
  running: boolean;
  /** PID of the running server (if detected) */
  pid?: number;
  /** Port is occupied by a non-dashboard service */
  portConflict?: boolean;
}

/**
 * Check if a dashboard server is running on the given port by hitting GET /api/health.
 * Returns identity-verified status instead of just "port is open".
 */
export async function isDashboardRunning(port: number, host = "localhost"): Promise<DashboardStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

  try {
    const res = await fetch(`http://${host}:${port}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { running: false, portConflict: true };
    }

    const data = await res.json() as Record<string, unknown>;
    if (data && data.ok === true && typeof data.pid === "number") {
      return { running: true, pid: data.pid };
    }

    // HTTP 200 but not our format — another service
    return { running: false, portConflict: true };
  } catch (err: unknown) {
    clearTimeout(timer);
    // Connection refused or timeout — nothing running
    if (err instanceof Error && err.name === "AbortError") {
      return { running: false };
    }
    // Could be ECONNREFUSED or other network error
    return { running: false };
  }
}
