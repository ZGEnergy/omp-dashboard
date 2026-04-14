/**
 * Process manager for spawning pi sessions via tmux or headless (RPC mode).
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { SpawnStrategy } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import { MANAGED_BIN } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";
import { ToolResolver } from "@blackbelt-technology/pi-dashboard-shared/tool-resolver.js";

/** Server-side resolver — knows the current process node binary. */
const resolver = new ToolResolver({ processExecPath: process.execPath });

/** Build env with managed install bin + current node binary dir prepended to PATH.
 *  Delegates to ToolResolver.buildSpawnEnv().
 */
export function buildSpawnEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return resolver.buildSpawnEnv(baseEnv);
}

export interface PlatformInfo {
  strategy: "tmux" | "wsl" | "cmd";
  platform: string;
}

export function detectPlatform(platform?: string): PlatformInfo {
  const p = platform ?? process.platform;

  if (p === "darwin" || p === "linux") {
    return { strategy: "tmux", platform: p };
  }
  if (p === "win32") {
    return { strategy: "wsl", platform: p };
  }
  return { strategy: "tmux", platform: p };
}

export interface SessionOptions {
  sessionFile?: string;
  mode?: "continue" | "fork";
  strategy?: SpawnStrategy;
}

export function buildTmuxCommand(cwd: string, sessionExists: boolean, options?: SessionOptions): string {
  const safeCwd = shellEscape(cwd);
  let piCmd = `cd ${safeCwd} && pi`;

  if (options?.sessionFile && options?.mode === "continue") {
    piCmd = `cd ${safeCwd} && pi --session ${shellEscape(options.sessionFile)}`;
  } else if (options?.sessionFile && options?.mode === "fork") {
    piCmd = `cd ${safeCwd} && pi --fork ${shellEscape(options.sessionFile)}`;
  }

  if (sessionExists) {
    return `tmux new-window -t pi-dashboard -c ${safeCwd} "${piCmd}"`;
  }
  return `tmux new-session -d -s pi-dashboard -c ${safeCwd} "${piCmd}"`;
}

function isTmuxAvailable(): boolean {
  try {
    execSync("which tmux", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function dashboardSessionExists(): boolean {
  try {
    execSync("tmux has-session -t pi-dashboard 2>/dev/null", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export interface SpawnResult {
  success: boolean;
  message: string;
  pid?: number;
  process?: ChildProcess;
  /** True when spawned from the dashboard (for writing session meta) */
  dashboardSpawned?: boolean;
}

export function buildHeadlessArgs(options?: SessionOptions): string[] {
  const args = ["--mode", "rpc"];

  if (options?.sessionFile && options?.mode === "continue") {
    args.push("--session", options.sessionFile);
  } else if (options?.sessionFile && options?.mode === "fork") {
    args.push("--fork", options.sessionFile);
  }

  return args;
}

/** Resolve the pi command as [command, ...prefixArgs].
 *  Delegates to ToolResolver.resolvePi().
 */
function resolvePiCommand(): string[] | null {
  return resolver.resolvePi();
}

function spawnHeadless(cwd: string, options?: SessionOptions): SpawnResult {
  try {
    const args = buildHeadlessArgs(options);
    const env = buildSpawnEnv();

    // Pre-check: verify pi binary exists
    const piCmd_ = resolvePiCommand();
    if (!piCmd_) {
      return {
        success: false,
        message: `pi binary not found. Checked: ${MANAGED_BIN}/pi and system PATH.`,
      };
    }

    if (process.platform === "win32") {
      // Windows: spawn node.exe directly with pi's CLI entry point (no .cmd, no cmd window)
      const [bin, ...prefixArgs] = piCmd_;
      const needsShell = bin.endsWith(".cmd");
      const spawnBin = needsShell ? `"${bin}"` : bin;
      const spawnArgs = needsShell
        ? [...prefixArgs, ...args].map(a => `"${a}"`)
        : [...prefixArgs, ...args];
      const child = spawn(spawnBin, spawnArgs, {
        cwd,
        detached: false,
        stdio: ["pipe", "ignore", "ignore"],
        env,
        shell: needsShell,
        windowsHide: true,
      });
      child.unref();
      (child.stdin as any)?.unref();

      return {
        success: true,
        dashboardSpawned: true,
        message: `Pi session spawned headless (pid ${child.pid})`,
        pid: child.pid,
        process: child,
      };
    }

    // Unix (macOS / Linux / WSL): wrap with "tail -f /dev/null | pi" so stdin
    // is an internal pipe that survives GC and server restarts.
    // detached: true creates a new process group; we kill via -pid later.
    const piBin = piCmd_[0];
    const piCmd = [shellEscape(piBin), ...args.map(shellEscape)].join(" ");
    // Use "tail -f /dev/null" to keep stdin pipe open for pi.
    // Unlike "sleep N", tail -f /dev/null works correctly even when
    // the outer shell's stdin is /dev/null (stdio:"ignore"),
    // which breaks "sleep | pi" on some Linux systems.
    const child = spawn("sh", ["-c", `tail -f /dev/null | ${piCmd}`], {
      cwd,
      detached: true,
      stdio: "ignore",
      env,
    });
    child.unref();

    return {
      success: true,
      dashboardSpawned: true,
      message: `Pi session spawned headless (pid ${child.pid})`,
      pid: child.pid,
      process: child,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to spawn headless session: ${err.message}`,
    };
  }
}

/** Escape a string for safe use in a shell command. */
export function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export async function spawnPiSession(cwd: string, options?: SessionOptions & { electronMode?: boolean }): Promise<SpawnResult> {
  if (!existsSync(cwd)) {
    return {
      success: false,
      message: `Directory does not exist: ${cwd}`,
    };
  }

  // Electron mode always forces headless, skipping tmux detection entirely
  if (options?.electronMode || options?.strategy === "headless") {
    return spawnHeadless(cwd, options);
  }

  const platform = detectPlatform();

  if (platform.strategy === "tmux") {
    if (!isTmuxAvailable()) {
      return {
        success: false,
        message: "tmux is not installed. Install it to spawn sessions from the dashboard.",
      };
    }

    const exists = dashboardSessionExists();
    const cmd = buildTmuxCommand(cwd, exists, options);

    try {
      execSync(cmd, { stdio: "ignore" });
      return {
        success: true,
        dashboardSpawned: true,
        message: `Pi session spawned in tmux (${exists ? "new window" : "new session"})`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to spawn session: ${err.message}`,
      };
    }
  }

  if (platform.strategy === "wsl") {
    try {
      // Try WSL tmux first
      execSync("wsl which tmux", { stdio: "ignore" });
      const cmd = `wsl ${buildTmuxCommand(cwd, false)}`;
      execSync(cmd, { stdio: "ignore" });
      return { success: true, dashboardSpawned: true, message: "Pi session spawned via WSL tmux" };
    } catch {
      // Fallback to cmd
      try {
        spawn("cmd", ["/c", `cd /d "${cwd}" && pi`], {
          detached: true,
          stdio: "ignore",
        }).unref();
        return { success: true, dashboardSpawned: true, message: "Pi session spawned via cmd" };
      } catch (err: any) {
        return { success: false, message: `Failed to spawn: ${err.message}` };
      }
    }
  }

  return { success: false, message: "Unsupported platform" };
}
