#!/usr/bin/env node --import tsx
/**
 * PI Dashboard Server CLI
 *
 * Usage:
 *   pi-dashboard                    Start server in foreground (default)
 *   pi-dashboard start [flags]      Start server as background daemon
 *   pi-dashboard stop               Stop running daemon
 *   pi-dashboard restart [flags]    Restart daemon
 *   pi-dashboard status             Show daemon status
 *
 * Flags:
 *   --port <n>       HTTP port (default: 8000)
 *   --pi-port <n>    Pi gateway port (default: 9999)
 *   --dev            Development mode (skip static files)
 *   --no-tunnel      Disable zrok tunnel
 */
import { createServer, type ServerConfig } from "./server.js";
import { loadConfig, ensureConfig } from "../shared/config.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readPid, isProcessAlive, removePid, isServerRunning } from "./server-pid.js";
import { isPortOpen } from "../extension/server-probe.js";
import { resolveJitiImport } from "../shared/resolve-jiti.js";

const SUBCOMMANDS = ["start", "stop", "restart", "status"] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

export interface ParsedArgs {
  subcommand: Subcommand | null;
  flags: Partial<ServerConfig>;
}

/**
 * Parse CLI arguments into a subcommand + flags.
 * Exported for testing.
 */
export function parseArgs(args: string[]): ParsedArgs {
  const flags: Partial<ServerConfig> = {};
  let subcommand: Subcommand | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    // Check for subcommand (first positional arg)
    if (!subcommand && SUBCOMMANDS.includes(arg as Subcommand)) {
      subcommand = arg as Subcommand;
      continue;
    }

    if (arg === "--port" && next) {
      flags.port = parseInt(next, 10);
      i++;
    } else if (arg === "--pi-port" && next) {
      flags.piPort = parseInt(next, 10);
      i++;
    } else if (arg === "--dev") {
      flags.dev = true;
    } else if (arg === "--no-tunnel") {
      flags.tunnel = false;
    }
  }

  return { subcommand, flags };
}

/**
 * Build the full server config from CLI flags, env vars, and config file.
 */
export function buildConfig(flags: Partial<ServerConfig>): ServerConfig {
  const fileConfig = loadConfig();
  return {
    port: flags.port ?? (parseInt(process.env.PI_DASHBOARD_PORT ?? "") || null) ?? fileConfig.port,
    piPort: flags.piPort ?? (parseInt(process.env.PI_DASHBOARD_PI_PORT ?? "") || null) ?? fileConfig.piPort,
    dev: flags.dev ?? false,
    autoShutdown: fileConfig.autoShutdown,
    shutdownIdleSeconds: fileConfig.shutdownIdleSeconds,
    tunnel: flags.tunnel ?? fileConfig.tunnel.enabled,
    tunnelReservedToken: fileConfig.tunnel.reservedToken,
    authConfig: fileConfig.auth,
  };
}

/**
 * Run the server in the foreground (original behavior).
 */
async function runForeground(config: ServerConfig): Promise<void> {
  const server = await createServer(config);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      console.log("Force exit.");
      process.exit(1);
    }
    shuttingDown = true;
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.start();
}

/**
 * Start the server as a detached background daemon.
 */
async function cmdStart(config: ServerConfig): Promise<void> {
  const running = await isServerRunning(config.port);
  if (running) {
    console.log(`Dashboard server is already running (pid ${running})`);
    return;
  }

  // Spawn ourselves in foreground mode (no subcommand) as a detached process
  const cliPath = fileURLToPath(import.meta.url);
  const args: string[] = [];
  if (config.port !== 8000) args.push("--port", String(config.port));
  if (config.piPort !== 9999) args.push("--pi-port", String(config.piPort));
  if (config.dev) args.push("--dev");
  if (!config.tunnel) args.push("--no-tunnel");

  let tsLoader: string;
  try {
    tsLoader = resolveJitiImport();
  } catch {
    tsLoader = "tsx";
  }

  const child = spawn(process.execPath, ["--import", tsLoader, cliPath, ...args], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();

  // Wait for port to become available (up to 5 seconds)
  const deadline = Date.now() + 5000;
  let started = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await isPortOpen(config.port)) {
      started = true;
      break;
    }
  }

  if (started) {
    const pid = readPid();
    console.log(`Dashboard server started (pid ${pid ?? child.pid}) at http://localhost:${config.port}`);
  } else {
    console.error("Failed to start dashboard server (timed out after 5s)");
    process.exit(1);
  }
}

/**
 * Stop the running server daemon.
 */
async function cmdStop(): Promise<void> {
  const pid = readPid();

  if (pid === null) {
    console.log("Dashboard server is not running");
    return;
  }

  if (!isProcessAlive(pid)) {
    removePid();
    console.log("Dashboard server is not running (cleaned up stale PID file)");
    return;
  }

  // Send SIGTERM and wait for process to exit
  process.kill(pid, "SIGTERM");

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    if (!isProcessAlive(pid)) {
      console.log("Dashboard server stopped");
      return;
    }
  }

  // Force kill if still alive
  try {
    process.kill(pid, "SIGKILL");
  } catch { /* already dead */ }
  removePid();
  console.log("Dashboard server stopped (forced)");
}

/**
 * Show server status.
 */
async function cmdStatus(port: number): Promise<void> {
  const pid = readPid();

  if (pid === null) {
    console.log("Dashboard server is not running");
    process.exit(1);
    return;
  }

  if (!isProcessAlive(pid)) {
    removePid();
    console.log("Dashboard server is not running (cleaned up stale PID file)");
    process.exit(1);
    return;
  }

  // Try health endpoint for richer info
  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    if (res.ok) {
      const data = await res.json() as { pid: number; uptime: number };
      console.log(`Dashboard server is running (pid ${data.pid}) on port ${port}, uptime ${data.uptime}s`);
      return;
    }
  } catch {
    // Fall back to basic info
  }

  console.log(`Dashboard server is running (pid ${pid}) on port ${port}`);
}

async function main() {
  ensureConfig();

  const { subcommand, flags } = parseArgs(process.argv.slice(2));
  const config = buildConfig(flags);

  switch (subcommand) {
    case "start":
      await cmdStart(config);
      break;
    case "stop":
      await cmdStop();
      break;
    case "restart":
      await cmdStop();
      await cmdStart(config);
      break;
    case "status":
      await cmdStatus(config.port);
      break;
    default:
      // No subcommand — run in foreground (backward compatible)
      await runForeground(config);
      break;
  }
}

// Only run when executed directly (not when imported for testing)
const isDirectExecution = process.argv[1] &&
  (process.argv[1].endsWith("cli.ts") || process.argv[1].endsWith("cli.js") || process.argv[1].endsWith("pi-dashboard"));

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Failed to start dashboard:", err);
    process.exit(1);
  });
}
