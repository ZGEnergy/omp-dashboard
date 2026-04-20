/**
 * Platform: process-creation primitives (merged module).
 *
 * This file is the single source of truth for "how does this codebase
 * create a subprocess". It is one of two files in `packages/shared/src/`
 * (the other being `tools.ts`) that may import from `node:child_process`
 * — enforced by `packages/shared/src/__tests__/no-direct-child-process.test.ts`.
 *
 * Merged from (see change: prep-for-develop-merge):
 *   • exec.ts               — child_process wrappers + buildSafeArgv
 *   • subprocess-adapter.ts — DI strategy adapter for exec
 *   • detached-spawn.ts     — spawnDetached + waitForNoCrash + waitForReady
 *   • spawn-mechanism.ts    — selectMechanism + buildWtArgs + sessionFlagsToArgv
 *
 * The module is structured by concern, using clearly marked section
 * banners. Each section retains the documentation and invariants from
 * its original file. No public API changes from the pre-merge state —
 * every name exported before is still exported here (and re-exported
 * via `platform/index.ts`).
 */

import {
  execSync as nodeExecSync,
  exec as nodeExec,
  execFile as nodeExecFile,
  spawnSync as nodeSpawnSync,
  spawn as nodeSpawn,
  type ChildProcess,
  type ExecFileOptions,
  type ExecOptions,
  type ExecSyncOptions,
  type SpawnOptions,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from "node:child_process";
import { promisify } from "node:util";

// ════════════════════════════════════════════════════════════════════════════
// ══  exec — child_process wrappers with windowsHide:true default           ══
// ════════════════════════════════════════════════════════════════════════════
//
// On Windows, spawning a `.cmd` shim (or anything node.exe wraps via cmd.exe)
// flashes a cmd-prompt window unless `windowsHide: true` is passed. Every
// spawn wrapper in this section applies `windowsHide: true` as the default.
// Callers can override by explicitly passing `windowsHide: false`.
//
// Every spawn in `packages/*/src` MUST use these wrappers (enforced by
// `no-direct-child-process.test.ts` lint).

// ── Argv safety (Windows .cmd / .bat handling) ─────────────────────────────

/**
 * Build a spawn-safe argv for ANY command on ANY platform.
 *
 * The canonical way to invoke subprocesses without flashing cmd.exe
 * console windows on Windows. Handles three cases:
 *
 *   1. Windows + `.cmd` / `.bat` shim → explicit `cmd.exe /c <cmd> <args>`.
 *      This is the ONLY reliable way to invoke `.cmd` files without the
 *      flashing-console bug (Node issue #21825, which happens when
 *      `shell: true` is combined with `.cmd` + `detached` + `windowsHide`).
 *      cmd.exe respects `windowsHide: true` on its own console directly.
 *
 *   2. Windows + native binary (`.exe`) → direct argv.
 *
 *   3. Unix (any binary or shell script) → direct argv.
 *
 * Always returns `{ shell: false, windowsHide: true }` — NEVER uses
 * `shell: true`. Callers pass these spawn options along with the argv.
 *
 * Example:
 *   const { argv, spawnOptions } = buildSafeArgv("npm.cmd", ["root", "-g"]);
 *   spawnSync(argv[0], argv.slice(1), { cwd, env, ...spawnOptions });
 */
export interface SafeArgv {
  argv: string[];
  spawnOptions: { shell: false; windowsHide: true };
}

export function buildSafeArgv(
  cmd: string,
  args: readonly string[] = [],
  platform: NodeJS.Platform = process.platform,
): SafeArgv {
  if (platform === "win32") {
    // Route through cmd.exe for TWO cases:
    //   1. Explicit .cmd/.bat shim — Node can't spawn these directly
    //      with shell:false (CVE-2024-27980 fix in Node >= 20.12).
    //   2. Extensionless name (e.g. "npm", "pi", "git") — Windows
    //      resolves these via PATHEXT, but only shells do. Without
    //      cmd.exe, spawn("npm") returns ENOENT because there's no
    //      literal "npm" binary — just "npm.cmd".
    // Native .exe / absolute paths bypass cmd.exe (no PATHEXT needed).
    //
    // /d = skip AutoRun, /s = treat quoted first token as command
    // (preserves spaces), /c = run and exit. cmd.exe honors
    // windowsHide on its console, so inner .cmd's node.exe inherits an
    // invisible console — no flash.
    const isShim = /\.(cmd|bat)$/i.test(cmd);
    const hasExtension = /\.[A-Za-z0-9]+$/.test(cmd);
    if (isShim || !hasExtension) {
      return {
        argv: ["cmd.exe", "/d", "/s", "/c", cmd, ...args],
        spawnOptions: { shell: false, windowsHide: true },
      };
    }
  }
  return {
    argv: [cmd, ...args],
    spawnOptions: { shell: false, windowsHide: true },
  };
}

// ── Option helpers ──────────────────────────────────────────────────────────

type AnyOptions = { windowsHide?: boolean } | undefined;

/**
 * Merge caller options with `windowsHide: true` as the default.
 * Explicit `windowsHide: false` from the caller is honored (for the rare
 * case where a visible console is actually desired).
 */
function withHide<T extends AnyOptions>(opts: T): T & { windowsHide: boolean } {
  const hide = opts?.windowsHide ?? true;
  return { ...(opts ?? {}), windowsHide: hide } as T & { windowsHide: boolean };
}

// ── Synchronous wrappers ────────────────────────────────────────────────────

/** Wrapped `execSync`. Always `windowsHide: true` unless overridden. */
export function execSync(
  command: string,
  options?: ExecSyncOptions,
): Buffer | string {
  return nodeExecSync(command, withHide(options));
}

/** Wrapped `spawnSync`. Always `windowsHide: true` unless overridden. */
export function spawnSync<T extends string | Buffer = Buffer>(
  command: string,
  args?: readonly string[],
  options?: SpawnSyncOptions,
): SpawnSyncReturns<T> {
  return nodeSpawnSync(command, args ?? [], withHide(options)) as SpawnSyncReturns<T>;
}

// ── Asynchronous (callback) wrappers ────────────────────────────────────────

/** Wrapped `exec` (callback form). */
export function exec(
  command: string,
  callback?: (err: Error | null, stdout: string, stderr: string) => void,
): ChildProcess;
export function exec(
  command: string,
  options: ExecOptions,
  callback?: (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void,
): ChildProcess;
export function exec(
  command: string,
  optionsOrCallback?: ExecOptions | ((err: Error | null, stdout: any, stderr: any) => void),
  maybeCallback?: (err: Error | null, stdout: any, stderr: any) => void,
): ChildProcess {
  if (typeof optionsOrCallback === "function") {
    return nodeExec(command, withHide(undefined) as ExecOptions, optionsOrCallback);
  }
  return nodeExec(command, withHide(optionsOrCallback) as ExecOptions, maybeCallback);
}

/** Wrapped `execFile` (callback form). */
export function execFile(
  file: string,
  args: readonly string[] | undefined,
  options: ExecFileOptions,
  callback?: (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void,
): ChildProcess;
export function execFile(
  file: string,
  args?: readonly string[],
  callback?: (err: Error | null, stdout: string, stderr: string) => void,
): ChildProcess;
export function execFile(
  file: string,
  args?: readonly string[],
  optionsOrCallback?: ExecFileOptions | ((err: Error | null, stdout: any, stderr: any) => void),
  maybeCallback?: (err: Error | null, stdout: any, stderr: any) => void,
): ChildProcess {
  if (typeof optionsOrCallback === "function") {
    return nodeExecFile(file, args ?? [], withHide(undefined) as ExecFileOptions, optionsOrCallback);
  }
  return nodeExecFile(file, args ?? [], withHide(optionsOrCallback) as ExecFileOptions, maybeCallback);
}

/** Wrapped `spawn`. Always `windowsHide: true` unless overridden. */
export function spawn(
  command: string,
  args?: readonly string[],
  options?: SpawnOptions,
): ChildProcess {
  return nodeSpawn(command, args ?? [], withHide(options));
}

// ── Promise-returning variants ──────────────────────────────────────────────

/** Promise-returning exec. */
export const execAsync = promisify(exec) as (
  command: string,
  options?: ExecOptions,
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

/** Promise-returning execFile. */
export const execFileAsync = promisify(execFile) as (
  file: string,
  args?: readonly string[],
  options?: ExecFileOptions,
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

// ── Types pass-through for convenience ──────────────────────────────────────

export type {
  ChildProcess,
  ExecFileOptions,
  ExecOptions,
  ExecSyncOptions,
  SpawnOptions,
  SpawnSyncOptions,
  SpawnSyncReturns,
};

// ════════════════════════════════════════════════════════════════════════════
// ══  subprocess-adapter — DI strategy wrapper around exec                  ══
// ════════════════════════════════════════════════════════════════════════════
//
// The adapter lets third-party code (package-manager-wrapper for pi's
// DefaultPackageManager) consume the safe spawn behavior via a typed
// interface rather than hard-importing the specific functions.
//
// Why an adapter instead of a global monkey-patch?
//   - Explicit dependency injection. Callers (and tests) know exactly
//     which spawn implementation they get.
//   - Isolated — third-party code gets the behaviour via a thin
//     subclass that consumes the adapter. No cross-cutting global state.
//   - Testable: fake adapter => assert argv without spawning real
//     subprocesses.

/**
 * Cross-platform subprocess adapter. Implementations guarantee:
 *   - `windowsHide: true` on Windows, always.
 *   - No `shell: true` ever — `.cmd` shims are invoked via explicit
 *     `cmd.exe /d /s /c` argv.
 *   - Arg arrays are passed verbatim, no shell-escaping surprises.
 */
export interface SubprocessAdapter {
  /** Async spawn. Returns the live ChildProcess. */
  spawn(command: string, args?: readonly string[], options?: SpawnOptions): ChildProcess;

  /** Synchronous spawn. Blocks until completion. */
  spawnSync<T extends string | Buffer = Buffer>(
    command: string,
    args?: readonly string[],
    options?: SpawnSyncOptions,
  ): SpawnSyncReturns<T>;
}

// ── Windows implementation ─────────────────────────────────────────────────

class WindowsSubprocessAdapter implements SubprocessAdapter {
  spawn(command: string, args: readonly string[] = [], options?: SpawnOptions): ChildProcess {
    const { argv, spawnOptions } = buildSafeArgv(command, args, "win32");
    return spawn(argv[0], argv.slice(1), { ...(options ?? {}), ...spawnOptions });
  }

  spawnSync<T extends string | Buffer = Buffer>(
    command: string,
    args: readonly string[] = [],
    options?: SpawnSyncOptions,
  ): SpawnSyncReturns<T> {
    const { argv, spawnOptions } = buildSafeArgv(command, args, "win32");
    return spawnSync<T>(argv[0], argv.slice(1), { ...(options ?? {}), ...spawnOptions });
  }
}

// ── Unix implementation ────────────────────────────────────────────────────

class UnixSubprocessAdapter implements SubprocessAdapter {
  spawn(command: string, args: readonly string[] = [], options?: SpawnOptions): ChildProcess {
    return spawn(command, args, { ...(options ?? {}), shell: false });
  }

  spawnSync<T extends string | Buffer = Buffer>(
    command: string,
    args: readonly string[] = [],
    options?: SpawnSyncOptions,
  ): SpawnSyncReturns<T> {
    return spawnSync<T>(command, args, { ...(options ?? {}), shell: false });
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Return the appropriate adapter for the given platform. Default:
 * `process.platform`. Tests pass explicit values without mutating the
 * global.
 */
export function createSubprocessAdapter(
  platform: NodeJS.Platform = process.platform,
): SubprocessAdapter {
  if (platform === "win32") return new WindowsSubprocessAdapter();
  return new UnixSubprocessAdapter();
}

/**
 * Process-wide default adapter. Constructed lazily on first access.
 * Callers that want a different strategy (e.g. tests injecting a fake)
 * pass the adapter explicitly to their constructor instead of using
 * this singleton.
 */
let defaultAdapter: SubprocessAdapter | null = null;
export function getDefaultSubprocessAdapter(): SubprocessAdapter {
  if (!defaultAdapter) defaultAdapter = createSubprocessAdapter();
  return defaultAdapter;
}

/** Test-only: drop the cached default adapter. */
export function _resetDefaultSubprocessAdapter(): void {
  defaultAdapter = null;
}

// ════════════════════════════════════════════════════════════════════════════
// ══  detached-spawn — spawnDetached + waitForNoCrash + waitForReady        ══
// ════════════════════════════════════════════════════════════════════════════
//
// OS-aware detached-child spawn primitives. The dashboard spawns several
// kinds of long-lived detached children (pi sessions, dashboard server
// from Electron or bridge, CLI restart orchestrator). This section gives
// them three primitives:
//
//   • spawnDetached    — spawn with libuv-correct defaults
//   • waitForNoCrash   — did the child survive a fixed window?
//   • waitForReady     — did the child pass a positive probe?
//
// Key invariants:
//
//   1. `detached: true` by default. On Windows, libuv only excludes a
//      child from the parent's global Job Object (which has
//      JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) when `detached: true`. Callers
//      whose lifecycle is deliberately tied to the parent (pi-session
//      spawn) pass `detach: false` instead.
//   2. `shell: false` always. `.cmd` shims must be pre-resolved to
//      `node.exe + cli.js` by the caller (via ToolResolver.resolvePi /
//      resolveTsx etc.). `shell: true + detached + windowsHide + .cmd`
//      triggers Node issue #21825 (flashing console window).
//   3. `windowsHide: true` always.

// ── spawnDetached ───────────────────────────────────────────────────────────

export interface SpawnDetachedOptions {
  /** Absolute path to the binary. MUST be pre-resolved — no `.cmd` shims. */
  cmd: string;
  /** Argv tokens. Passed verbatim to `spawn()`; no shell interpretation. */
  args: string[];
  /** Working directory for the child. */
  cwd?: string;
  /** Environment for the child. Defaults to `process.env` via Node. */
  env?: NodeJS.ProcessEnv;
  /**
   * Optional file descriptor for stderr. When omitted, stderr is "ignore".
   * Caller is responsible for `fs.openSync(logPath, "a")` and closing the
   * parent's copy after spawn (the child retains its dup via stdio
   * inheritance). File fds survive parent death; pipes do not.
   */
  logFd?: number;
  /**
   * stdin mode. Default: "ignore" — child's stdin closes immediately.
   *
   * Use `"pipe"` when the child is a Node program whose RPC mode
   * listens for stdin `end` events and shuts down on EOF (e.g.
   * pi-coding-agent's `--mode rpc`). A parent-held pipe keeps the
   * child's stdin open as long as the parent is alive. Note: when
   * the parent process dies, Windows closes the pipe and the child
   * gets EOF — i.e., stdio:"pipe" undoes the session-survives-
   * server-restart invariant of `detached: true`. Callers must pick
   * one property (durability vs RPC-mode keep-alive) consciously.
   */
  stdinMode?: "ignore" | "pipe";
  /**
   * Whether to detach the child from the parent's libuv Job Object
   * (Windows) / process group (POSIX). Default: `true`.
   *
   * When `true` (default):
   *   - Windows: child is excluded from the parent's Job Object, so
   *     killing the parent does NOT kill the child. Downside: libuv
   *     allocates a new console for the child unless all stdio slots
   *     are "ignore" (see libuv `src/win/process.c` — `CREATE_NO_WINDOW`
   *     is only set when no stdio slot has `UV_INHERIT_FD`). With a
   *     parent-held stdin pipe or file-fd stdout/stderr, brief console
   *     flashes occur despite `windowsHide: true` (which only applies
   *     `SW_HIDE` — hides AFTER allocation).
   *   - POSIX: child is placed in its own process group.
   *
   * When `false`:
   *   - Windows: child stays in parent's Job Object. `CREATE_NO_WINDOW`
   *     is irrelevant (no new console allocation). No flash regardless
   *     of stdio shape. Child dies with parent (Job Object closure).
   *   - POSIX: child inherits parent's process group. Child dies with
   *     parent on SIGTERM to the group.
   *
   * Use `false` when the child's lifecycle is deliberately tied to the
   * parent (e.g., pi-session spawn where RPC stdin-EOF already ties
   * them). Use default (`true`) for everything that must outlive its
   * parent (server auto-start, CLI daemon, Electron server launch).
   */
  detach?: boolean;
  /**
   * Override platform for testing. Does not affect spawn behaviour (Node's
   * `spawn` is platform-aware internally) but is surfaced here so future
   * platform-specific branches stay out of callers.
   */
  platform?: NodeJS.Platform;
}

export interface SpawnDetachedResult {
  ok: boolean;
  pid?: number;
  process?: ChildProcess;
  error?: string;
}

/**
 * Spawn a detached child with libuv-correct defaults on every platform.
 *
 * Returns `{ ok: true, pid, process }` on success. Returns `{ ok: false,
 * error }` when the child has no PID or fails synchronously. Async errors
 * are surfaced via a short (200 ms) grace period: if `ok: false` is
 * returned, either the child never started or it errored immediately.
 */
export async function spawnDetached(opts: SpawnDetachedOptions): Promise<SpawnDetachedResult> {
  const stdioIn: "ignore" | "pipe" = opts.stdinMode ?? "ignore";
  const stdio: ("ignore" | "pipe" | number)[] = [stdioIn, "ignore", opts.logFd ?? "ignore"];

  let child: ChildProcess;
  let spawnError: string | null = null;
  try {
    child = spawn(opts.cmd, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      detached: opts.detach ?? true,
      stdio,
      shell: false,
      windowsHide: true,
    } as SpawnOptions);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }

  child.on("error", (err: Error) => {
    spawnError = err.message;
  });

  // unref() so Node's event loop doesn't keep the parent alive because of
  // this child. Harmless when the child has its own stdio file fds.
  try { child.unref(); } catch { /* ignore */ }

  // Short grace window for synchronous / near-synchronous spawn errors
  // (ENOENT is emitted via 'error' on nextTick, not thrown).
  if (!child.pid) {
    await delay(200);
    return { ok: false, error: spawnError ?? "spawn failed: no PID" };
  }

  // If the child errored inside the grace window, surface it even though
  // we have a PID (some failures emit both: PID assigned then ENOENT on
  // the exec itself).
  await delay(5);
  if (spawnError) {
    return { ok: false, error: spawnError, pid: child.pid, process: child };
  }

  return { ok: true, pid: child.pid, process: child };
}

// ── waitForNoCrash ─────────────────────────────────────────────────────────

export interface WaitForNoCrashOptions {
  /** The child returned by spawnDetached(). */
  child: ChildProcess;
  /** How long to wait before declaring "didn't crash" (ms). */
  windowMs: number;
  /**
   * If > 0, capture up to N bytes from the child's stderr stream (if a
   * pipe is attached — which requires stdio[2] to be "pipe" rather than
   * a file fd). Only useful when the caller manually attached a pipe
   * before calling this; `spawnDetached` does NOT use pipes by default.
   */
  captureStderrBytes?: number;
}

export interface WaitForNoCrashResult {
  ok: boolean;
  exitCode?: number | null;
  stderrTail?: string;
}

/**
 * Wait up to `windowMs` milliseconds; return ok:true if the child is
 * still alive at the end, or ok:false if it exited within the window.
 *
 * The primary use case: pi spawn on Windows where we want to catch
 * "pi crashed on startup due to missing module / config error" without
 * blocking the response for the full startup handshake.
 */
export async function waitForNoCrash(opts: WaitForNoCrashOptions): Promise<WaitForNoCrashResult> {
  const { child, windowMs, captureStderrBytes } = opts;

  let stderrBuf = "";
  const cap = captureStderrBytes ?? 0;
  const onStderr = cap > 0 && child.stderr
    ? (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > cap) stderrBuf = stderrBuf.slice(-cap);
      }
    : null;
  if (onStderr) child.stderr!.on("data", onStderr);

  // Race fix: if the child has ALREADY exited by the time we're called
  // (common when spawnDetached's 205 ms grace window let the exit event
  // fire before waitForNoCrash registered its listener), child.exitCode
  // is populated. Short-circuit synchronously to avoid missing the event.
  if (child.exitCode !== null) {
    if (onStderr) child.stderr!.off("data", onStderr);
    return {
      ok: false,
      exitCode: child.exitCode,
      stderrTail: stderrBuf ? stderrBuf.trim() : undefined,
    };
  }

  const exitCode = await Promise.race([
    new Promise<number | null>((resolve) => child.once("exit", resolve)),
    delay(windowMs).then(() => undefined),
  ]);

  if (onStderr) child.stderr!.off("data", onStderr);

  if (exitCode === undefined) {
    return { ok: true };
  }
  return {
    ok: false,
    exitCode,
    stderrTail: stderrBuf ? stderrBuf.trim() : undefined,
  };
}

// ── waitForReady ───────────────────────────────────────────────────────────

export interface WaitForReadyOptions {
  /** Called repeatedly until it resolves true, or deadline elapses. */
  probe: () => Promise<boolean>;
  /**
   * Maximum total wait (ms). Omit (or pass `undefined`) to wait
   * indefinitely — in that case the only way to end the wait early is
   * the optional `child` crashing. Use the infinite form when the
   * caller trusts child-exit detection to cover the failure path and
   * doesn't want a false-positive timeout on slow-but-working starts
   * (e.g., cold jiti compile on Windows).
   */
  deadlineMs?: number;
  /** Poll interval (ms). Default 500. */
  pollIntervalMs?: number;
  /**
   * Optional child for early failure detection. If provided, an `error`
   * event or non-zero `exit` short-circuits the wait.
   */
  child?: ChildProcess;
}

export interface WaitForReadyResult {
  ok: boolean;
  error?: string;
}

/**
 * Poll `probe()` until it resolves true, or return timeout / early-failure.
 * When `deadlineMs` is undefined, polls indefinitely until the probe
 * succeeds or the child crashes.
 */
export async function waitForReady(opts: WaitForReadyOptions): Promise<WaitForReadyResult> {
  const { probe, deadlineMs, pollIntervalMs = 500, child } = opts;

  let childError: string | null = null;
  const onError = (err: Error) => { childError = err.message; };
  const onExit = (code: number | null) => {
    if (code !== 0 && code !== null) {
      childError = `child exited with code ${code}`;
    } else if (code === 0) {
      // Exit 0 is fine for short-lived children (e.g., wt.exe). Don't
      // treat it as an error — the probe decides readiness.
    }
  };
  if (child) {
    child.on("error", onError);
    child.on("exit", onExit);
  }

  const deadline = deadlineMs === undefined ? Infinity : Date.now() + deadlineMs;
  try {
    while (Date.now() < deadline) {
      if (childError) return { ok: false, error: childError };
      try {
        if (await probe()) return { ok: true };
      } catch {
        // Swallow probe errors — treat as "not ready yet".
      }
      await delay(pollIntervalMs);
    }
    if (childError) return { ok: false, error: childError };
    return { ok: false, error: "timeout" };
  } finally {
    if (child) {
      child.off("error", onError);
      child.off("exit", onExit);
    }
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ════════════════════════════════════════════════════════════════════════════
// ══  spawn-mechanism — selectMechanism + buildWtArgs + sessionFlagsToArgv  ══
// ════════════════════════════════════════════════════════════════════════════
//
// The user expresses preference via a two-valued config type
// (`SpawnStrategy` = "tmux" | "headless"). The dashboard internally
// decides WHICH actual mechanism to use given the OS and what's
// available on this host. This section is the single source of truth
// for that decision.
//
// Mechanisms:
//   • "tmux"      — Unix terminal multiplexer (Linux, macOS)
//   • "wt"        — Windows Terminal new-tab (Win10/11)
//   • "wsl-tmux"  — WSL-hosted tmux (Windows, niche)
//   • "headless"  — RPC-mode pi, no TTY, bridge over WebSocket
//
// `selectMechanism` is pure: no I/O, no subprocess calls. Availability
// is determined by the caller (typically via `ToolRegistry.resolve`)
// and passed in. This keeps the decision trivially testable.

export type SpawnMechanism = "tmux" | "wt" | "wsl-tmux" | "headless";

/** User-visible config value (from `SpawnStrategy` in shared/config.ts). */
export type UserSpawnStrategy = "tmux" | "headless";

export interface SpawnMechanismContext {
  platform: NodeJS.Platform;
  userStrategy: UserSpawnStrategy;
  electronMode: boolean;
  available: {
    tmux: boolean;
    wt: boolean;
    wslTmux: boolean;
  };
}

/**
 * Select one spawn mechanism for this platform given the user's
 * preference, the electron-mode flag, and tool availability.
 *
 * Rules (in order):
 *   1. electronMode forces "headless".
 *   2. userStrategy "headless" forces "headless".
 *   3. Unix (linux/darwin): tmux if available, else headless.
 *   4. Windows: wt > wsl-tmux > headless.
 *   5. Any other platform falls back to headless.
 */
export function selectMechanism(ctx: SpawnMechanismContext): SpawnMechanism {
  if (ctx.electronMode) return "headless";
  if (ctx.userStrategy === "headless") return "headless";

  if (ctx.platform === "linux" || ctx.platform === "darwin") {
    return ctx.available.tmux ? "tmux" : "headless";
  }
  if (ctx.platform === "win32") {
    if (ctx.available.wt) return "wt";
    if (ctx.available.wslTmux) return "wsl-tmux";
    return "headless";
  }
  return "headless";
}

// ── Windows Terminal argv builder ───────────────────────────────────────────

export interface WtArgsOptions {
  /** Absolute cwd for the new tab. Spaces / parens / quotes are safe in argv form. */
  cwd: string;
  /** Tab title, typically the basename of cwd. */
  title: string;
  /**
   * Pre-resolved pi argv: typically [node.exe, cli.js, --mode?, rpc?, --fork?, file?].
   * Interactive wt sessions OMIT --mode rpc so pi runs its TUI.
   */
  piArgv: string[];
}

/**
 * Build argv (NOT a shell string) to invoke Windows Terminal so it opens
 * a new tab in the existing WT window and runs `piArgv` there.
 *
 * Design notes:
 *   • argv form — passed to spawn with shell:false, so wt re-parses it
 *     internally. No need to escape spaces, semicolons, or quotes in cwd.
 *   • `-w 0` reuses the most-recently-used WT window; new tab, not new
 *     window. Matches tmux `new-window` semantics.
 *   • No `-p <profile>` — respect the user's default WT profile
 *     (cmd / pwsh / WSL).
 *   • `--` sentinel before piArgv so any `-` or `/` prefix in piArgv
 *     can't be misparsed as a wt option.
 */
export function buildWtArgs(opts: WtArgsOptions): string[] {
  return [
    "-w", "0",
    "new-tab",
    "-d", opts.cwd,
    "--title", opts.title,
    "--",
    ...opts.piArgv,
  ];
}

// ── Shared helper: append session/fork flags uniformly ─────────────────────

export interface SessionFlags {
  sessionFile?: string;
  mode?: "continue" | "fork";
}

/**
 * Return `["--session", file]` or `["--fork", file]` or `[]`.
 * Every mechanism MUST use this to append flags; dropping them silently
 * is the exact bug that motivated this change (B1, B2).
 */
export function sessionFlagsToArgv(flags: SessionFlags): string[] {
  if (flags.sessionFile && flags.mode === "continue") {
    return ["--session", flags.sessionFile];
  }
  if (flags.sessionFile && flags.mode === "fork") {
    return ["--fork", flags.sessionFile];
  }
  return [];
}
