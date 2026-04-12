/**
 * Server discovery and lifecycle management for Electron.
 * Uses health check → spawn server.
 *
 * NOTE: This module must NOT import from @blackbelt-technology/pi-dashboard-shared
 * or @blackbelt-technology/pi-dashboard-server via dynamic import(). In the packaged
 * Electron app, those packages are inside resources/server/node_modules/ which is NOT
 * on the ESM module resolution path. All config reading and health checking is inlined.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { readModeFile } from "./wizard-state.js";
import { detectSystemNode } from "./dependency-detector.js";
import { getBundledNodePath } from "./bundled-node.js";

let serverStartedByUs = false;

/** Did Electron start the server this session? */
export function didWeStartServer(): boolean {
  return serverStartedByUs;
}

// ── Inlined config reading (replaces @blackbelt-technology/pi-dashboard-shared/config) ──

interface MinimalConfig {
  port: number;
  piPort: number;
}

function loadMinimalConfig(): MinimalConfig {
  const defaults = { port: 8000, piPort: 9999 };
  try {
    const configFile = path.join(os.homedir(), ".pi", "dashboard", "config.json");
    if (!existsSync(configFile)) return defaults;
    const raw = readFileSync(configFile, "utf-8").trim();
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      port: typeof parsed.port === "number" ? parsed.port : defaults.port,
      piPort: typeof parsed.piPort === "number" ? parsed.piPort : defaults.piPort,
    };
  } catch {
    return defaults;
  }
}

// ── Inlined health check (replaces @blackbelt-technology/pi-dashboard-shared/server-identity) ──

interface DashboardStatus {
  running: boolean;
  pid?: number;
  portConflict?: boolean;
}

async function isDashboardRunning(port: number): Promise<DashboardStatus> {
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
      return { running: true, pid: data.pid };
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

// ── Server discovery and launch ────────────────────────────────────────────────

/**
 * Discover or launch the dashboard server.
 * Returns the URL to connect to.
 */
export async function ensureServer(): Promise<string> {
  const config = loadMinimalConfig();

  // 1. Health check — is the server already running?
  const status = await isDashboardRunning(config.port);
  if (status.running) {
    return `http://localhost:${config.port}`;
  }

  if (status.portConflict) {
    throw new Error(`Port ${config.port} is in use by another service. Change the dashboard port in ~/.pi/dashboard/config.json`);
  }

  // 2. Launch server as detached process
  await launchServer(config.port, config.piPort);
  serverStartedByUs = true;
  return `http://localhost:${config.port}`;
}

const MANAGED_DIR = path.join(os.homedir(), ".pi-dashboard");

/** Resolve tsx as [command, ...prefixArgs] to avoid .cmd and shell:true on Windows.
 *  On Unix: returns ["path/to/tsx"]
 *  On Windows: returns ["path/to/node.exe", "path/to/tsx/dist/cli.mjs"]
 *  This avoids spawning .cmd batch files which need shell:true and flash a console window.
 */
function resolveTsxCommand(): string[] | null {
  // Try managed install first
  const managedTsxCli = path.join(MANAGED_DIR, "node_modules", "tsx", "dist", "cli.mjs");
  if (process.platform === "win32" && existsSync(managedTsxCli)) {
    // On Windows, find node.exe and run tsx's entry point directly
    const nodePath = getBundledNodePath() || detectSystemNode().path;
    if (nodePath) return [nodePath, managedTsxCli];
  }

  // Unix or fallback: use the tsx binary directly
  const ext = process.platform === "win32" ? ".cmd" : "";
  const managed = path.join(MANAGED_DIR, "node_modules", ".bin", "tsx" + ext);
  if (existsSync(managed)) return [managed];

  // System PATH
  try {
    const { execSync } = require("node:child_process");
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const result = execSync(`${whichCmd} tsx`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (result) return [result.split("\n")[0]];
  } catch { /* not found */ }

  return null;
}

/** Find the server CLI path. */
function findServerCli(): string | null {
  const candidates = [
    // Bundled with Electron app (resources/server/)
    (process as any).resourcesPath
      ? path.join((process as any).resourcesPath, "server", "packages", "server", "src", "cli.ts")
      : null,
    // Dev mode: relative to electron package
    path.resolve(__dirname, "..", "..", "..", "..", "server", "src", "cli.ts"),
    // Managed install
    path.join(MANAGED_DIR, "node_modules", "@blackbelt-technology", "pi-dashboard", "packages", "server", "src", "cli.ts"),
  ].filter(Boolean) as string[];

  try {
    candidates.push(require.resolve("@blackbelt-technology/pi-dashboard-server/cli.ts"));
  } catch { /* not resolvable */ }

  return candidates.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
}

/** Launch the dashboard server as a detached background process. */
async function launchServer(port: number, piPort: number): Promise<void> {
  // Resolve tsx command (avoids .cmd on Windows — no shell needed, no cmd window)
  const tsxCmd = resolveTsxCommand();
  if (!tsxCmd) {
    throw new Error("tsx not found. Run the setup wizard to install dependencies.");
  }

  // Find server CLI
  const cliPath = findServerCli();
  if (!cliPath) {
    throw new Error("Dashboard server CLI not found. Run the setup wizard or reinstall the app.");
  }

  // Resolve Node.js for the PATH (tsx needs it)
  const systemNode = detectSystemNode();
  const bundledNode = getBundledNodePath();
  const nodeBinDir = bundledNode ? path.dirname(bundledNode) : (systemNode.found ? path.dirname(systemNode.path!) : null);

  // Build environment
  const env = { ...process.env };

  // Ensure node + tsx are on PATH
  const tsxBinDir = path.dirname(tsxCmd[0]);
  const extraPath = [nodeBinDir, tsxBinDir].filter(Boolean).join(path.delimiter);
  env.PATH = `${extraPath}${path.delimiter}${env.PATH || ""}`;

  // Ensure NODE_PATH includes bundled server's node_modules
  const serverRoot = path.resolve(path.dirname(cliPath), "..", "..");
  const bundledModules = path.join(serverRoot, "node_modules");
  const managedModules = path.join(MANAGED_DIR, "node_modules");
  env.NODE_PATH = [bundledModules, managedModules, env.NODE_PATH || ""].filter(Boolean).join(path.delimiter);

  const cwd = serverRoot;
  // tsxCmd is [node, tsx-cli.mjs] or [tsx]; append server CLI args
  const spawnBin = tsxCmd[0];
  const spawnArgs = [...tsxCmd.slice(1), cliPath, "--port", String(port), "--pi-port", String(piPort)];

  // Log server startup for debugging
  const logDir = MANAGED_DIR;
  const logPath = path.join(logDir, "server.log");
  try { mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }

  const launchInfo = [
    `[${new Date().toISOString()}] Launching dashboard server`,
    `  command: ${spawnBin} ${spawnArgs.join(" ")}`,
    `  cwd: ${cwd}`,
    `  PATH: ${env.PATH?.split(path.delimiter).slice(0, 3).join(path.delimiter)}...`,
    `  NODE_PATH: ${env.NODE_PATH}`,
    "",
  ].join("\n");
  try { writeFileSync(logPath, launchInfo); } catch { /* ignore */ }

  let stdio: any = "ignore";
  try {
    const logFd = openSync(logPath, "a");
    stdio = ["ignore", logFd, logFd];
  } catch { /* can't write log, use ignore */ }

  // Launch: tsx <cli.ts> (tsx handles all TypeScript loading + __dirname shimming)
  // On Windows, spawnBin is node.exe (not .cmd) so no shell needed = no cmd window
  const child = spawn(spawnBin, spawnArgs, {
    detached: true,
    stdio,
    env,
    cwd,
    windowsHide: true,
  });

  let spawnError: string | null = null;
  child.on("error", (err) => { spawnError = err.message; });
  child.unref();

  // Wait for server to become available
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    if (spawnError) {
      throw new Error(`Server process failed to spawn: ${spawnError}`);
    }
    const check = await isDashboardRunning(port);
    if (check.running) return;
  }

  // Read log for error details
  let logContent = "";
  try { logContent = readFileSync(logPath, "utf-8"); } catch { /* ignore */ }
  const lastLines = logContent.split("\n").slice(-20).join("\n");

  throw new Error(
    `Server failed to start within 15 seconds.\n` +
    `Command: ${spawnBin} ${spawnArgs.join(" ")}\n` +
    `CWD: ${cwd}\n` +
    (lastLines ? `\nServer log:\n${lastLines}` : "\nNo server log available.")
  );
}

/** Stop the server if we started it. */
export async function stopServerIfNeeded(): Promise<void> {
  if (!serverStartedByUs) return;
  const config = loadMinimalConfig();
  try {
    await fetch(`http://localhost:${config.port}/api/shutdown`, { method: "POST" });
  } catch { /* already stopped */ }
}
