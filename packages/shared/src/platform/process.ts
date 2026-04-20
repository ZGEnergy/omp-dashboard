/**
 * Platform: process observation + termination primitives (merged module).
 *
 * Merged from (see change: prep-for-develop-merge phase 3b):
 *   • process.ts           — findPortHolders, killProcess, killPidWithGroup, isProcessAlive
 *   • process-scan.ts      — isProcessRunning, parseEtime
 *   • process-identify.ts  — findPidByMarker, isProcessLikePi, isPiCommandLine
 *
 * Every OS-dependent helper accepts injectable `platform` and `exec`
 * parameters (defaulting to `process.platform` and `execSync`), so tests
 * can exercise both branches without mutating the global `process.platform`.
 *
 * The three original `ExecFn` types (one per merged file, each with a
 * slightly different options shape) are unified below into a single
 * widest-signature type that accepts `encoding`, `timeout`, and `stdio`
 * options. Existing callers continue to work: TypeScript structurally
 * accepts narrower options on a widened type.
 */

import { execSync } from "./spawn.js";
import { existsSync, readFileSync } from "node:fs";

// ── Unified ExecFn signature ────────────────────────────────────────────────

/**
 * Widest-shape exec injection type. Historically this codebase had three
 * near-identical `ExecFn` types scattered across process.ts /
 * process-scan.ts / process-identify.ts with subtly different options.
 * The merged signature accepts every option any of them used.
 */
export type ExecFn = (
  cmd: string,
  opts: { encoding: "utf-8"; timeout?: number; stdio?: any },
) => string;

export type KillFn = (pid: number, signal: NodeJS.Signals | number) => void;

function defaultExec(cmd: string, opts: { encoding: "utf-8"; timeout?: number; stdio?: any }): string {
  // Always suppress the cmd.exe window flash on Windows. Every primitive
  // in this module runs via netstat/tasklist/taskkill/pgrep/ps — none of
  // them benefit from a visible console.
  return execSync(cmd, { ...opts, windowsHide: true }) as unknown as string;
}

function defaultKill(pid: number, signal: NodeJS.Signals | number): void {
  process.kill(pid, signal);
}

// ════════════════════════════════════════════════════════════════════════════
// ══  process.ts — port holders + kill + liveness + group-kill             ══
// ════════════════════════════════════════════════════════════════════════════

export interface ProcessOpts {
  /** Override platform (defaults to process.platform). */
  platform?: NodeJS.Platform;
  /** Override execSync (for tests). */
  exec?: ExecFn;
  /** Override process.kill (for tests). */
  kill?: KillFn;
}

// ── Port-holder detection ────────────────────────────────────────────────────

/**
 * Parse `netstat -ano -p tcp` output for PIDs listening on a port (Windows).
 * Pure function, exported for testing.
 *
 * Example input line:
 *   "  TCP    0.0.0.0:8000   0.0.0.0:0   LISTENING   12345"
 */
export function parseNetstatListeners(output: string, port: number, selfPid: number): number[] {
  const pids: number[] = [];
  const portSuffix = `:${port}`;
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !/^\s*TCP/i.test(line)) continue;
    if (!/LISTENING/i.test(line)) continue;
    const cols = trimmed.split(/\s+/);
    if (cols.length < 5) continue;
    const local = cols[1];
    if (!local.endsWith(portSuffix)) continue;
    const pid = Number.parseInt(cols[cols.length - 1], 10);
    if (Number.isFinite(pid) && pid > 0 && pid !== selfPid) pids.push(pid);
  }
  return pids;
}

/**
 * Find PIDs holding a TCP port. Cross-platform:
 *   - win32: `netstat -ano -p tcp` → parse LISTENING rows
 *   - unix:  `lsof -t -i :<port> -sTCP:LISTEN`
 *
 * Best-effort: any failure returns []. Excludes the current process PID.
 */
export function findPortHolders(port: number, opts: ProcessOpts = {}): number[] {
  const platform = opts.platform ?? process.platform;
  const exec = opts.exec ?? defaultExec;
  try {
    if (platform === "win32") {
      const output = exec("netstat -ano -p tcp", { encoding: "utf-8" });
      return parseNetstatListeners(String(output), port, process.pid);
    }
    const output = exec(`lsof -t -i :${port} -sTCP:LISTEN 2>/dev/null`, { encoding: "utf-8" });
    return String(output).trim().split("\n").map(Number).filter((n) => n > 0 && n !== process.pid);
  } catch {
    return [];
  }
}

// ── Liveness ─────────────────────────────────────────────────────────────────

/**
 * Check whether a PID is alive. Cross-platform via `process.kill(pid, 0)`.
 */
export function isProcessAlive(pid: number, opts: { kill?: KillFn } = {}): boolean {
  const kill = opts.kill ?? defaultKill;
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Termination ──────────────────────────────────────────────────────────────

export interface KillProcessResult {
  ok: boolean;
  forced: boolean;
}

/**
 * Terminate a process, cross-platform:
 *   - win32: `taskkill /F /T /PID <pid>` (tree kill, immediate)
 *   - unix:  SIGTERM → wait up to `timeoutMs` → SIGKILL if still alive
 *
 * Returns `{ ok, forced }`. `ok` is true if the process was terminated (or
 * was already dead); `forced` is true if SIGKILL was needed on Unix.
 */
export async function killProcess(
  pid: number,
  opts: ProcessOpts & { timeoutMs?: number } = {},
): Promise<KillProcessResult> {
  const platform = opts.platform ?? process.platform;
  const exec = opts.exec ?? defaultExec;
  const kill = opts.kill ?? defaultKill;
  const timeoutMs = opts.timeoutMs ?? 5000;

  if (!isProcessAlive(pid, { kill })) return { ok: false, forced: false };

  if (platform === "win32") {
    try {
      exec(`taskkill /F /T /PID ${pid}`, { encoding: "utf-8" });
      return { ok: true, forced: false };
    } catch {
      return { ok: false, forced: false };
    }
  }

  try {
    kill(pid, "SIGTERM");
  } catch {
    return { ok: false, forced: false };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    if (!isProcessAlive(pid, { kill })) return { ok: true, forced: false };
  }
  try {
    kill(pid, "SIGKILL");
  } catch {
    /* already dead */
  }
  return { ok: true, forced: true };
}

// ── Process-group kill (for detached children) ───────────────────────────────

/**
 * Signal a process, targeting the process group on Unix (negative PID) and
 * the PID directly on Windows. Used for detached children spawned with their
 * own process group.
 */
export function killPidWithGroup(
  pid: number,
  signal: NodeJS.Signals,
  opts: ProcessOpts = {},
): void {
  const platform = opts.platform ?? process.platform;
  const kill = opts.kill ?? defaultKill;
  const target = platform === "win32" ? pid : -pid;
  kill(target, signal);
}

// ════════════════════════════════════════════════════════════════════════════
// ══  process-scan — isProcessRunning + parseEtime                         ══
// ════════════════════════════════════════════════════════════════════════════

export interface ProcessScanOpts {
  /** Override platform (defaults to process.platform). */
  platform?: NodeJS.Platform;
  /** Override execSync (for tests). */
  exec?: ExecFn;
}

// ── Elapsed-time parsing (pure, platform-agnostic) ──────────────────────────

/**
 * Parse `ps -o etime=` format into milliseconds. Handles:
 *   - `mm:ss`          (e.g. "02:15" → 135000)
 *   - `hh:mm:ss`       (e.g. "01:30:00" → 5400000)
 *   - `dd-hh:mm:ss`    (e.g. "2-03:00:00" → 183600000)
 *
 * Returns 0 for empty or unparseable input.
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

// ── Process-running check ───────────────────────────────────────────────────

/**
 * Check whether a process matching `pattern` is currently running.
 *   - win32: `tasklist /FI "IMAGENAME eq <pattern>" /NH` — pattern is the
 *            executable image name (e.g. "Code.exe"). Returns true if the
 *            output contains the pattern.
 *   - unix:  `pgrep -f "<pattern>"` — pattern is any substring of the
 *            command-line (e.g. "/Applications/Zed.app"). Returns true if
 *            pgrep exits with code 0 (at least one match).
 *
 * Best-effort: any failure returns `false`.
 */
export function isProcessRunning(pattern: string, opts: ProcessScanOpts = {}): boolean {
  const platform = opts.platform ?? process.platform;
  const exec = opts.exec ?? defaultExec;
  try {
    if (platform === "win32") {
      const result = exec(`tasklist /FI "IMAGENAME eq ${pattern}" /NH`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
      return String(result).includes(pattern);
    }
    exec(`pgrep -f "${pattern}"`, { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ══  process-identify — findPidByMarker + isProcessLikePi + isPiCommandLine══
// ════════════════════════════════════════════════════════════════════════════
//
// Windows branches are intentional stubs: there is no cheap, format-stable
// cross-command way to inspect a PID's command line (tasklist /V is slow
// and locale-dependent). Windows pi-ness is verified via `headlessPidRegistry`
// at the server level, which tracks PID → session identity directly at
// spawn time. Future work can extend these Windows branches with WMIC /
// PowerShell probing in ONE place (here) instead of scattered inline checks.

export interface ProcessIdentifyOpts {
  /** Override platform (defaults to process.platform). */
  platform?: NodeJS.Platform;
  /** Override execSync (for tests). */
  exec?: ExecFn;
}

// ── Pattern matcher ─────────────────────────────────────────────────────────

/** Returns true iff the given command-line string references pi or node. */
export function isPiCommandLine(commandLine: string): boolean {
  return /\bpi\b|\bnode\b/.test(commandLine);
}

// ── findPidByMarker ─────────────────────────────────────────────────────────

/**
 * Find PIDs whose command line contains `marker`. Unix uses ps|grep;
 * Windows returns `[]` (command-line lookup is delegated to
 * headlessPidRegistry at the server level).
 *
 * Never throws. Returns `[]` on any error.
 */
export function findPidByMarker(marker: string, opts: ProcessIdentifyOpts = {}): number[] {
  const platform = opts.platform ?? process.platform;
  if (platform === "win32") return [];

  const exec = opts.exec ?? defaultExec;
  // Additional sentinels help distinguish pi headless spawns from other
  // processes that happen to contain the session ID in an env var or
  // unrelated argument. The canonical sentinels match the Unix headless
  // wrapper strings.
  const sentinels = ["sleep 2147483647", "tail -f /dev/null"];

  try {
    const out = exec(
      `ps -eo pid,command | grep ${shellQuote(marker)} | grep -v grep`,
      { encoding: "utf-8", timeout: 3000 },
    ).trim();
    if (!out) return [];

    const pids: number[] = [];
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Must also contain one of the pi headless sentinels, else it's
      // probably a grep/editor/tail-of-log matching the session id.
      const hasSentinel = sentinels.some((s) => trimmed.includes(s));
      if (!hasSentinel) continue;
      const pidStr = trimmed.split(/\s+/, 1)[0];
      const pid = parseInt(pidStr, 10);
      if (pid > 0) pids.push(pid);
    }
    return pids;
  } catch {
    return [];
  }
}

// ── isProcessLikePi ────────────────────────────────────────────────────────

/**
 * Check if a PID belongs to a pi/node process. Safety check before
 * SIGKILL on Unix; no-op on Windows where pi-ness is tracked by
 * the PID registry at spawn time.
 *
 * Unix behaviour:
 *   - macOS: `ps -p <pid> -o command=`
 *   - Linux: `/proc/<pid>/cmdline` with `ps` fallback via `cat`
 *
 * Returns `false` if the process has already exited (command fails).
 * Returns `true` on Windows unconditionally.
 */
export function isProcessLikePi(pid: number, opts: ProcessIdentifyOpts = {}): boolean {
  const platform = opts.platform ?? process.platform;
  if (platform === "win32") return true;

  const exec = opts.exec ?? defaultExec;
  const cmd = platform === "darwin"
    ? `ps -p ${pid} -o command=`
    : `cat /proc/${pid}/cmdline 2>/dev/null || ps -p ${pid} -o command=`;

  try {
    const output = exec(cmd, { encoding: "utf-8", timeout: 2000 }).trim();
    return isPiCommandLine(output);
  } catch {
    return false;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function shellQuote(s: string): string {
  // Strict allow-list: if the marker is purely [A-Za-z0-9._-], leave it alone;
  // otherwise single-quote it safely. Session IDs are UUIDs or similar and
  // fall into the allow-list in practice, so this is almost always a no-op.
  if (/^[A-Za-z0-9._-]+$/.test(s)) return `"${s}"`;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// ════════════════════════════════════════════════════════════════════════════
// ══  getProcessCmdline — cross-platform command-line lookup by PID         ══
// ════════════════════════════════════════════════════════════════════════════
//
// Returns the full command line of a running process, or null when the pid
// doesn't exist, the lookup fails, or the platform has no cheap mechanism.
//
// Separated from isProcessLikePi / isPiCommandLine because callers
// (e.g. editor-pid-registry's cmdline-ownership verification) want the raw
// cmdline string, not a predicate.

export function getProcessCmdline(pid: number, opts: ProcessIdentifyOpts = {}): string | null {
  const platform = opts.platform ?? process.platform;
  const exec = opts.exec ?? defaultExec;

  try {
    if (platform === "linux") {
      const file = `/proc/${pid}/cmdline`;
      if (!existsSync(file)) return null;
      const raw = readFileSync(file, "utf-8");
      return raw.replace(/\0/g, " ").trim() || null;
    }
    if (platform === "darwin") {
      const out = exec(`ps -p ${pid} -o command=`, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return String(out).trim() || null;
    }
    if (platform === "win32") {
      const out = exec(`wmic process where ProcessId=${pid} get CommandLine /value`, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const m = String(out).match(/CommandLine=(.*)/);
      return m ? m[1].trim() || null : null;
    }
  } catch {
    return null;
  }
  return null;
}
