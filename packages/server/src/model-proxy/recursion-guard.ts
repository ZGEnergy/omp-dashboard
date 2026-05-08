/**
 * Recursion guard: prevent custom providers from pointing back at the dashboard.
 *
 * See change: add-dashboard-model-proxy.
 */
import os from "node:os";

/**
 * Collect all addresses the dashboard listens on.
 * Includes localhost variants, LAN IPs, and optional mDNS/tunnel hostnames.
 */
export function collectDashboardOrigins(
  port: number,
  opts?: { tunnelHostname?: string; mdnsHostname?: string },
): string[] {
  const origins: string[] = [
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
  ];

  // Add LAN IPs
  try {
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.internal) continue;
        const addr = entry.family === "IPv6" ? `[${entry.address}]` : entry.address;
        origins.push(`${addr}:${port}`);
      }
    }
  } catch {
    // Best effort
  }

  if (opts?.tunnelHostname) origins.push(opts.tunnelHostname);
  if (opts?.mdnsHostname) origins.push(`${opts.mdnsHostname}:${port}`);

  return origins;
}

/**
 * Check if a baseUrl points back to the dashboard.
 */
export function isSelfPointing(baseUrl: string, dashboardOrigins: string[]): boolean {
  try {
    const url = new URL(baseUrl);
    // Normalize: lowercase host, remove default ports
    const host = url.hostname.toLowerCase();
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    const normalized = `${host}:${port}`;

    // Also check without port for tunnel hostnames (which include no port)
    const normalizedHostOnly = host;

    for (const origin of dashboardOrigins) {
      const originLower = origin.toLowerCase();
      if (originLower === normalized) return true;
      if (originLower === normalizedHostOnly) return true;
      // Handle origin with port vs normalized
      if (originLower.includes(":")) {
        if (originLower === normalized) return true;
      } else {
        if (originLower === normalizedHostOnly) return true;
      }
    }
    return false;
  } catch {
    return false; // Malformed URL — not self-pointing
  }
}
