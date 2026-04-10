/**
 * Process scanner for detecting child processes of a pi session.
 * Unix-only (macOS + Linux); returns empty results on Windows.
 *
 * Two-phase approach:
 * 1. CAPTURE: During active bash tool calls, `ps -eo pid=,ppid=` finds children
 *    of the pi process (pgrep is not used — it misses detached children on macOS).
 *    Grandchildren are found by recursing one level. PGIDs are stored in a tracked set.
 * 2. CHECK: On every scan, verify which tracked PGIDs are still alive via ps.
 *    Dead ones are removed from the set.
 *
 * This handles the reparenting problem: children get reparented to PID 1
 * when the bash wrapper exits, but we captured their PGIDs while alive.
 */
import { spawnSync as defaultSpawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";

export interface ChildProcessInfo {
  pid: number;
  pgid: number;
  command: string;
  elapsedMs: number;
}

/**
 * Parse ps ETIME format into milliseconds.
 * Formats: mm:ss, hh:mm:ss, dd-hh:mm:ss
 */
export function parseEtime(etime: string): number {
  const trimmed = etime.trim();
  if (!trimmed) return 0;

  let days = 0;
  let rest = trimmed;

  const dashIdx = rest.indexOf("-");
  if (dashIdx !== -1) {
    days = parseInt(rest.slice(0, dashIdx), 10);
    if (isNaN(days)) return 0;
    rest = rest.slice(dashIdx + 1);
  }

  const parts = rest.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;

  let hours = 0, minutes = 0, seconds = 0;
  if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  } else if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else {
    return 0;
  }

  return ((days * 86400) + (hours * 3600) + (minutes * 60) + seconds) * 1000;
}

const DEFAULT_MIN_ELAPSED_MS = 30_000;

export type SpawnSyncFn = (cmd: string, args: string[], opts: any) => SpawnSyncReturns<string>;

/** Get direct child PIDs of a parent using ps (pgrep misses detached children on macOS). */
function getChildPids(parentPid: number, spawnSync: SpawnSyncFn): number[] {
  try {
    const result = spawnSync("ps", ["-eo", "pid=,ppid="], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0 || !result.stdout) return [];
    const pids: number[] = [];
    for (const line of result.stdout.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length === 2) {
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        if (ppid === parentPid && !isNaN(pid)) pids.push(pid);
      }
    }
    return pids;
  } catch {
    return [];
  }
}

/** Parse one line of ps output: "  PID  PGID ETIME ARGS..." */
function parsePsLine(line: string): ChildProcessInfo | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
  if (!match) return null;

  return {
    pid: parseInt(match[1], 10),
    pgid: parseInt(match[2], 10),
    elapsedMs: parseEtime(match[3]),
    command: match[4],
  };
}

export interface ScanOptions {
  _spawnSync?: SpawnSyncFn;
}

/**
 * Captures new child PIDs of the pi process and adds their PGIDs to the tracked set.
 * Call this during active bash tool calls when children are still in the process tree.
 */
export function captureChildPgids(
  parentPid: number,
  trackedPgids: Set<number>,
  options?: ScanOptions,
): void {
  if (process.platform === "win32") return;

  const spawnSync: SpawnSyncFn = options?._spawnSync ?? defaultSpawnSync;

  const directChildren = getChildPids(parentPid, spawnSync);
  if (directChildren.length === 0) return;

  // Collect all PIDs (children + grandchildren)
  const allPids: number[] = [];
  for (const childPid of directChildren) {
    const grandchildren = getChildPids(childPid, spawnSync);
    if (grandchildren.length > 0) {
      allPids.push(...grandchildren);
    } else {
      allPids.push(childPid);
    }
  }

  if (allPids.length === 0) return;

  // Get PGIDs for all discovered PIDs
  try {
    const result = spawnSync("ps", ["-p", allPids.join(","), "-o", "pgid="], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0 || !result.stdout) return;

    for (const line of result.stdout.split("\n")) {
      const pgid = parseInt(line.trim(), 10);
      if (!isNaN(pgid) && pgid > 0) {
        trackedPgids.add(pgid);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Scans tracked PGIDs to find which are still alive.
 * Returns live processes, removes dead PGIDs from the set.
 */
export function scanTrackedProcesses(
  trackedPgids: Set<number>,
  minElapsedMs: number = DEFAULT_MIN_ELAPSED_MS,
  options?: ScanOptions,
): ChildProcessInfo[] {
  if (process.platform === "win32" || trackedPgids.size === 0) return [];

  const spawnSync: SpawnSyncFn = options?._spawnSync ?? defaultSpawnSync;

  // Find all processes belonging to tracked PGIDs
  // Use ps to find processes by PGID — we check all at once
  const pgidList = Array.from(trackedPgids);

  try {
    // Get all processes, then filter by PGID
    const result = spawnSync("ps", ["-eo", "pid=,pgid=,etime=,args="], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0 || !result.stdout) return [];

    const pgidSet = new Set(pgidList);
    const alivePgids = new Set<number>();
    const processes: ChildProcessInfo[] = [];

    for (const line of result.stdout.split("\n")) {
      const info = parsePsLine(line);
      if (!info) continue;
      if (!pgidSet.has(info.pgid)) continue;

      alivePgids.add(info.pgid);

      // Skip bash/sh wrappers (show the actual commands, not the shell)
      const binary = info.command.split(/\s/)[0]?.split("/").pop() ?? "";
      if (binary === "bash" || binary === "sh") continue;

      if (info.elapsedMs >= minElapsedMs) {
        processes.push(info);
      }
    }

    // Remove dead PGIDs from tracked set
    for (const pgid of pgidList) {
      if (!alivePgids.has(pgid)) {
        trackedPgids.delete(pgid);
      }
    }

    return processes;
  } catch {
    return [];
  }
}

/**
 * Combined scan: capture new children + check tracked PGIDs.
 * Convenience wrapper for the bridge timer.
 */
export function scanChildProcesses(
  parentPid: number,
  trackedPgids: Set<number>,
  minElapsedMs: number = DEFAULT_MIN_ELAPSED_MS,
  options?: ScanOptions,
): ChildProcessInfo[] {
  if (process.platform === "win32") return [];

  // Phase 1: Capture any new children (during active bash calls)
  captureChildPgids(parentPid, trackedPgids, options);

  // Phase 2: Check which tracked PGIDs are still alive
  return scanTrackedProcesses(trackedPgids, minElapsedMs, options);
}

/**
 * Kill a process group by PGID using SIGTERM.
 * Returns true if signal was sent, false if process was already dead or on Windows.
 */
export function killProcessByPgid(pgid: number): boolean {
  if (process.platform === "win32") return false;
  try {
    process.kill(-pgid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}
