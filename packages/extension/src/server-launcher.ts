/**
 * Server launcher — spawns the dashboard server as a detached process.
 * The spawned server runs in foreground mode (no subcommand) and writes
 * its own PID file at ~/.pi/dashboard/server.pid.
 */
import { spawnDetached, waitForReady } from "@blackbelt-technology/pi-dashboard-shared/platform/spawn.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DashboardConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import { resolveJitiImport } from "@blackbelt-technology/pi-dashboard-shared/resolve-jiti.js";
import { isDashboardRunning } from "@blackbelt-technology/pi-dashboard-shared/server-identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface LaunchResult {
  success: boolean;
  message: string;
}

/**
 * Resolve the dashboard server CLI script path relative to this extension file.
 * From packages/extension/src/server-launcher.ts → packages/server/src/cli.ts
 */
export function resolveServerCliPath(): string {
  return path.resolve(__dirname, "..", "..", "server", "src", "cli.ts");
}

/**
 * Build the spawn arguments from config.
 */
export function buildSpawnArgs(config: DashboardConfig): string[] {
  return [
    "--port", String(config.port),
    "--pi-port", String(config.piPort),
  ];
}

/**
 * Launch the dashboard server as a detached background process.
 * Returns success/failure after a brief wait to detect early crashes.
 */
export async function launchServer(config: DashboardConfig): Promise<LaunchResult> {
  const cliPath = resolveServerCliPath();
  const args = buildSpawnArgs(config);

  try {
    // Open the server.log in append mode so any startup error is visible.
    // Matches the log location used by `pi-dashboard start`.
    let logFd: number | undefined;
    try {
      const logDir = path.join(os.homedir(), ".pi", "dashboard");
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, "server.log");
      logFd = fs.openSync(logPath, "a");
      fs.writeSync(
        logFd,
        `\n[${new Date().toISOString()}] bridge auto-start (parent pid ${process.pid}, port ${config.port})\n`,
      );
    } catch { /* if we can't open the log, spawn still works */ }

    // Spawn server via the detached-spawn primitive. resolveJitiImport()
    // returns a file:// URL (required on Windows for node --import).
    const r = await spawnDetached({
      cmd: process.execPath,
      args: ["--import", resolveJitiImport(), cliPath, ...args],
      env: { ...process.env },
      logFd,
    });

    // Close the parent's copy of the log fd — the child has its own.
    if (logFd !== undefined) {
      try { fs.closeSync(logFd); } catch { /* ignore */ }
    }

    if (!r.ok || !r.process) {
      return { success: false, message: `Server process failed to spawn: ${r.error ?? "unknown"}` };
    }

    // Wait for the server to actually become available via positive
    // HTTP probe. NO deadline — we rely on child-exit for failure
    // detection. A timeout here only catches the pathological case
    // "process alive but never ready", which is rarer than the
    // false-positive case "slow cold-start mistakenly flagged as
    // failure" (Fastify + jiti compile + session scan can take 15–30s
    // on Windows). If the child crashes, `waitForReady` returns
    // { ok: false, error: "child exited with code N" } via its
    // `child` listener. If the child hangs alive-but-broken, the user
    // can kill it manually — timers don't help that case anyway.
    const ready = await waitForReady({
      probe: async () => (await isDashboardRunning(config.port)).running,
      pollIntervalMs: 300,
      child: r.process,
      // deadlineMs intentionally omitted — wait indefinitely.
    });

    if (!ready.ok) {
      return {
        success: false,
        message: `Server process failed: ${ready.error ?? "unknown"}. See ~/.pi/dashboard/server.log`,
      };
    }

    return { success: true, message: "Server started" };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
