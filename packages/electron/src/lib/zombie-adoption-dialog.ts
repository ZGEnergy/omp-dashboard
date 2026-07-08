/**
 * Zombie-server adoption modal.
 *
 * Shown on the Electron `attach` arm when the discovered server is detected as
 * a leftover from a prior Electron lifetime (see `decideIsZombie`). Offers
 * three choices; the default (dismiss / Esc) is the safest "leave running".
 *
 * See change: electron-attach-ownership-fixes.
 */
import { dialog } from "electron";

export type ZombieChoice = "adopt" | "leave" | "stop";

/**
 * Present the adoption modal for a detected zombie server. Returns the user's
 * choice. Button order is fixed; `cancelId`/`defaultId` both point at
 * "Leave running" so Esc / window-close resolves to the zero-action path.
 */
export async function promptZombieAdoption(params: { pid: number }): Promise<ZombieChoice> {
  const buttons = ["Take ownership", "Leave running", "Stop now"];
  const leaveIndex = 1;
  const { response } = await dialog.showMessageBox({
    type: "question",
    title: "Leftover server from a previous run",
    message: "Leftover server from a previous run",
    detail:
      `A dashboard server (PID ${params.pid}) appears to have outlived a previous ` +
      `Electron session. Take ownership so quitting this app cleans it up?`,
    buttons,
    defaultId: leaveIndex,
    cancelId: leaveIndex,
    noLink: true,
  });
  if (response === 0) return "adopt";
  if (response === 2) return "stop";
  return "leave";
}

/**
 * Stop a zombie server: SIGTERM, then poll for up to `timeoutMs` for it to go
 * away, then SIGKILL if still alive. Pure w.r.t. injected deps so it can be
 * unit-tested without a real process. Returns `true` once the server is
 * confirmed gone (or was already gone).
 *
 * See change: electron-attach-ownership-fixes.
 */
export async function stopZombieServer(
  pid: number,
  deps: {
    kill: (pid: number, signal: NodeJS.Signals) => void;
    isRunning: () => Promise<boolean>;
    sleep: (ms: number) => Promise<void>;
    timeoutMs?: number;
    pollMs?: number;
  },
): Promise<boolean> {
  const timeoutMs = deps.timeoutMs ?? 5000;
  const pollMs = deps.pollMs ?? 200;
  try {
    deps.kill(pid, "SIGTERM");
  } catch {
    // already dead
    return true;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await deps.sleep(pollMs);
    if (!(await deps.isRunning())) return true;
  }
  try {
    deps.kill(pid, "SIGKILL");
  } catch {
    /* already dead */
  }
  return true;
}
