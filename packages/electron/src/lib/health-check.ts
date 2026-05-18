/**
 * Dashboard server health check.
 *
 * Thin re-export over `@blackbelt-technology/pi-dashboard-shared/server-identity.js`
 * so the Electron main process and the dashboard server share a single
 * retry-aware probe implementation. See change:
 * streamline-electron-bootstrap-and-recovery (Failure 4).
 *
 * The shared module is reachable from packaged Electron (other modules
 * under `lib/` import shared submodules; the historical "MUST NOT import
 * from shared" note no longer applies).
 */
export type { DashboardStatus, DashboardCheckOpts } from "@blackbelt-technology/pi-dashboard-shared/server-identity.js";
export { isDashboardRunning } from "@blackbelt-technology/pi-dashboard-shared/server-identity.js";
