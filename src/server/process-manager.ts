/**
 * Process manager for spawning pi sessions via tmux.
 */
import { execSync, spawn } from "node:child_process";

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
}

export function buildTmuxCommand(cwd: string, sessionExists: boolean, options?: SessionOptions): string {
  let piCmd = `cd ${cwd} && PI_DASHBOARD_SPAWNED=1 pi`;

  if (options?.sessionFile && options?.mode === "continue") {
    piCmd = `cd ${cwd} && PI_DASHBOARD_SPAWNED=1 pi --session ${options.sessionFile}`;
  } else if (options?.sessionFile && options?.mode === "fork") {
    piCmd = `cd ${cwd} && PI_DASHBOARD_SPAWNED=1 pi --fork ${options.sessionFile}`;
  }

  if (sessionExists) {
    return `tmux new-window -t pi-dashboard -c "${cwd}" "${piCmd}"`;
  }
  return `tmux new-session -d -s pi-dashboard -c "${cwd}" "${piCmd}"`;
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
}

export async function spawnPiSession(cwd: string, options?: SessionOptions): Promise<SpawnResult> {
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
