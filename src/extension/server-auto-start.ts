/**
 * Auto-start logic for the dashboard server.
 * Extracted from bridge.ts for testability.
 */

export interface AutoStartDeps {
  isPortOpen: (port: number) => Promise<boolean>;
  launchServer: (config: any) => Promise<{ success: boolean; message: string }>;
  notify: (message: string, level: "info" | "warning") => void;
}

/**
 * Attempt to auto-start the dashboard server if not running.
 * When launch fails, re-probes the port to detect concurrent launches
 * by other agents before showing a warning.
 */
export async function autoStartServer(
  config: { piPort: number; port: number; autoStart: boolean },
  deps: AutoStartDeps,
): Promise<void> {
  const running = await deps.isPortOpen(config.piPort);
  if (running || !config.autoStart) return;

  const result = await deps.launchServer(config);
  if (result.success) {
    deps.notify(`🌐 Dashboard started at http://localhost:${config.port}`, "info");
  } else {
    // Another agent may have started the server concurrently — recheck before warning
    const nowRunning = await deps.isPortOpen(config.piPort);
    if (!nowRunning) {
      deps.notify(`Dashboard server failed to start: ${result.message}`, "warning");
    }
  }
}
