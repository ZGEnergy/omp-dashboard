/**
 * Process manager for spawning pi sessions via tmux or headless (RPC mode).
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { SpawnStrategy } from "../shared/config.js";

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
  let piCmd = `cd ${safeCwd} && PI_DASHBOARD_SPAWNED=1 pi`;

  if (options?.sessionFile && options?.mode === "continue") {
    piCmd = `cd ${safeCwd} && PI_DASHBOARD_SPAWNED=1 pi --session ${shellEscape(options.sessionFile)}`;
  } else if (options?.sessionFile && options?.mode === "fork") {
    piCmd = `cd ${safeCwd} && PI_DASHBOARD_SPAWNED=1 pi --fork ${shellEscape(options.sessionFile)}`;
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

function spawnHeadless(cwd: string, options?: SessionOptions): SpawnResult {
  try {
    const args = buildHeadlessArgs(options);

    if (process.platform === "win32") {
      // Windows: no sh/sleep, spawn pi directly with a pipe.
      // stdin EOF on server exit will terminate the agent; this is a known
      // limitation on Windows (process groups aren't supported).
      const child = spawn("pi", args, {
        cwd,
        detached: true,
        stdio: ["pipe", "ignore", "ignore"],
        env: { ...process.env, PI_DASHBOARD_SPAWNED: "1" },
      });
      child.unref();
      (child.stdin as any)?.unref();

      return {
        success: true,
        message: `Pi session spawned headless (pid ${child.pid})`,
        pid: child.pid,
        process: child,
      };
    }

    // Unix (macOS / Linux / WSL): wrap with "sleep infinity | pi" so stdin
    // is an internal pipe that survives server restarts.
    // "sleep 2147483647" is used instead of "sleep infinity" for compatibility
    // with older macOS versions whose BSD sleep doesn't support "infinity".
    // detached: true creates a new process group; we kill via -pid later.
    const piCmd = ["pi", ...args].map(shellEscape).join(" ");
    const child = spawn("sh", ["-c", `sleep 2147483647 | ${piCmd}`], {
      cwd,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PI_DASHBOARD_SPAWNED: "1" },
    });
    child.unref();

    return {
      success: true,
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

export async function spawnPiSession(cwd: string, options?: SessionOptions): Promise<SpawnResult> {
  if (!existsSync(cwd)) {
    return {
      success: false,
      message: `Directory does not exist: ${cwd}`,
    };
  }

  if (options?.strategy === "headless") {
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
      return { success: true, message: "Pi session spawned via WSL tmux" };
    } catch {
      // Fallback to cmd
      try {
        spawn("cmd", ["/c", `cd /d "${cwd}" && set PI_DASHBOARD_SPAWNED=1 && pi`], {
          detached: true,
          stdio: "ignore",
        }).unref();
        return { success: true, message: "Pi session spawned via cmd" };
      } catch (err: any) {
        return { success: false, message: `Failed to spawn: ${err.message}` };
      }
    }
  }

  return { success: false, message: "Unsupported platform" };
}
