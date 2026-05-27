/**
 * Process manager for spawning pi sessions.
 *
 * Dispatch is owned by `platform/spawn-mechanism.ts`'s `selectMechanism`.
 * Per-mechanism spawn is owned by `platform/detached-spawn.ts`. This
 * module's job is: resolve pi + tool availability, build per-mechanism
 * command, delegate.
 *
 * Invariants:
 *   - No direct `process.platform === "..."` branches in this file.
 *     All platform-aware behaviour lives in `platform/**`.
 *   - Every mechanism branch builds pi argv uniformly from
 *     `buildHeadlessArgs` or its wt/tmux counterpart; `sessionFile`
 *     and `mode` are never dropped by any branch.
 *
 * See change: consolidate-windows-spawn-and-platform-handlers.
 */
import { existsSync, mkdirSync, openSync, closeSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ChildProcess } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import type { SpawnStrategy } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import { MANAGED_BIN } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";
import { ToolResolver } from "@blackbelt-technology/pi-dashboard-shared/platform/binary-lookup.js";
import { prependManagedNodeToPath } from "@blackbelt-technology/pi-dashboard-shared/platform/managed-node-path.js";
import { loadConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import { mintSpawnToken } from "./spawn-token.js";
import {
  createKeeperManager,
  type KeeperManager,
} from "./rpc-keeper/keeper-manager.js";
import { randomUUID } from "node:crypto";
import { execSync, spawnSync, buildSafeArgv } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import {
  spawnDetached,
  waitForNoCrash,
} from "@blackbelt-technology/pi-dashboard-shared/platform/detached-spawn.js";
import {
  selectMechanism,
  buildWtArgs,
  sessionFlagsToArgv,
  type SpawnMechanism,
  type UserSpawnStrategy,
} from "@blackbelt-technology/pi-dashboard-shared/platform/spawn-mechanism.js";
import type { SpawnFailureCode } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";

// ── Resolver seam (injectable for tests) ────────────────────────────────────

let resolver: ToolResolver = new ToolResolver({ processExecPath: process.execPath });

/** Inject a resolver — used by tests. Production code never calls this. */
export function setResolver(r: ToolResolver): void {
  resolver = r;
}

/** Reset to default — used by tests to clean up. */
export function resetResolver(): void {
  resolver = new ToolResolver({ processExecPath: process.execPath });
}

// ── KeeperManager seam (injectable for tests) ──────────────────────────

let keeperManager: KeeperManager | null = null;

/** Inject a KeeperManager — used by tests. Production code lazy-inits below. */
export function setKeeperManager(km: KeeperManager | null): void {
  keeperManager = km;
}

/**
 * Public lazy accessor for the singleton `KeeperManager`. Exposed so the
 * server-side dispatch handler (`rpc-keeper/dispatch-router.ts`) and
 * `headlessPidRegistry.setKeeperWriter` can share the same instance the
 * spawn path uses. Tests still inject via `setKeeperManager`.
 * See change: add-rpc-stdin-dispatch-with-keeper-sidecar (Phase 6 + 8).
 */
export function getKeeperManager(): KeeperManager {
  if (!keeperManager) keeperManager = createKeeperManager();
  return keeperManager;
}

/**
 * Hook used by tests to override the `useRpcKeeper` flag read from config
 * without mutating `~/.pi/dashboard/config.json`. Returns `null` to defer
 * to the real config.
 */
let useRpcKeeperOverride: boolean | null = null;
export function _setUseRpcKeeperOverrideForTests(v: boolean | null): void {
  useRpcKeeperOverride = v;
}
function shouldUseRpcKeeper(): boolean {
  if (useRpcKeeperOverride !== null) return useRpcKeeperOverride;
  try { return loadConfig().useRpcKeeper === true; } catch { return false; }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface SessionOptions {
  sessionFile?: string;
  mode?: "continue" | "fork";
  strategy?: SpawnStrategy;
  /**
   * Server-minted spawn correlation token. When provided, injected into
   * the spawned process env as `PI_DASHBOARD_SPAWN_TOKEN`. The bridge
   * echoes it back in the first `session_register` so the server can
   * resolve identity precisely (linkByToken). When omitted, callers
   * fall through to pid-link or cwd-FIFO matching.
   * See change: spawn-correlation-token.
   */
  spawnToken?: string;
}

export interface SpawnResult {
  success: boolean;
  message: string;
  pid?: number;
  process?: ChildProcess;
  /** True when spawned from the dashboard (for writing session meta) */
  dashboardSpawned?: boolean;
  /** Structured failure classifier. Set on every { success: false } path. See change: spawn-failure-diagnostics. */
  code?: SpawnFailureCode;
  /** Tail of pi's stderr log (Windows headless PI_CRASHED only). See change: spawn-failure-diagnostics. */
  stderr?: string;
  /** Path to the per-session stderr log (Windows headless). Forwarded to watchdog. See change: spawn-failure-diagnostics. */
  logPath?: string;
  /**
   * Token minted by `spawnPiSession` and injected into the spawned process's
   * env as `PI_DASHBOARD_SPAWN_TOKEN`. Returned so callers can register it
   * with the headless-pid registry, watchdog, and pending-* registries.
   * See change: spawn-correlation-token.
   */
  spawnToken?: string;
  /**
   * RPC keeper UDS / named-pipe path. Set ONLY when the keeper-mediated
   * spawn path was taken (`useRpcKeeper: true`). Callers pass this to
   * `headlessPidRegistry.register(..., { keeperPid, keeperSockPath })` so
   * later `writeRpc` / `killBySessionId` calls can locate the keeper.
   * In keeper mode `pid` IS the keeper PID, so `keeperPid` is implicit.
   * See change: add-rpc-stdin-dispatch-with-keeper-sidecar.
   */
  keeperSockPath?: string;
}

/**
 * Build env for pi-session spawns.
 *
 * Order of PATH prepends (highest priority first):
 *   1. Managed Node runtime (`<managedDir>/node/{bin,}`) when installed.
 *      See change: embed-managed-node-runtime.
 *   2. Managed bin (`<managedDir>/node_modules/.bin`).
 *   3. Current Node binary dir, extra bin dirs, common user bin dirs.
 *
 * The managed-Node prepend happens AFTER the resolver's prepends so it
 * lands at the very head of `PATH` — spawned children invoking plain
 * `node` / `npm` resolve to the managed runtime first.
 */
export function buildSpawnEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  opts?: { spawnToken?: string },
): NodeJS.ProcessEnv {
  const env = prependManagedNodeToPath(resolver.buildSpawnEnv(baseEnv));
  if (opts?.spawnToken) {
    // Inject the correlation token so the bridge inside the spawned pi
    // process can read it and echo back in `session_register`.
    // See change: spawn-correlation-token.
    return { ...env, PI_DASHBOARD_SPAWN_TOKEN: opts.spawnToken };
  }
  return env;
}

/**
 * Escape a string for safe use inside a POSIX shell command.
 * Used by buildTmuxCommand for tmux/wsl-tmux argv construction.
 */
export function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Build the argv tail for a headless pi invocation: `--mode rpc` plus
 * `--session <file>` or `--fork <file>` when options provide them.
 */
export function buildHeadlessArgs(options?: SessionOptions): string[] {
  return ["--mode", "rpc", ...sessionFlagsToArgv(options ?? {})];
}

/**
 * Build the argv tail for an INTERACTIVE pi invocation (wt, tmux, wsl-tmux):
 * no `--mode rpc`; just session/fork flags when provided.
 */
export function buildInteractivePiArgs(options?: SessionOptions): string[] {
  return sessionFlagsToArgv(options ?? {});
}

/**
 * Build a tmux shell command string to run pi in a new tmux window/session.
 * Kept as a string (not argv) because tmux is invoked via `execSync(cmd)`.
 */
export function buildTmuxCommand(cwd: string, sessionExists: boolean, options?: SessionOptions): string {
  const safeCwd = shellEscape(cwd);
  const flags = sessionFlagsToArgv(options ?? {})
    .map(shellEscape)
    .join(" ");
  const piCmd = flags ? `cd ${safeCwd} && pi ${flags}` : `cd ${safeCwd} && pi`;
  if (sessionExists) {
    return `tmux new-window -t pi-dashboard -c ${safeCwd} "${piCmd}"`;
  }
  return `tmux new-session -d -s pi-dashboard -c ${safeCwd} "${piCmd}"`;
}

// ── Availability probes (isolated, one place) ───────────────────────────────

function isTmuxAvailable(): boolean {
  try {
    // `which` / `where` already baked into ToolResolver.
    return resolver.which("tmux") !== null;
  } catch {
    return false;
  }
}

function isWtAvailable(): boolean {
  try {
    return resolver.which("wt") !== null;
  } catch {
    return false;
  }
}

// Cache the WSL-tmux probe for the server lifetime. On machines with a broken
// WSL install (e.g. Docker Desktop WSL mount failure) this single probe can
// cost 30+ seconds — we MUST NOT pay it on every + Session click. The result
// can only change if the user installs/uninstalls WSL or tmux, which requires
// a server restart anyway.
let _wslTmuxAvailabilityCache: boolean | null = null;
let _wslFallbackLogged = false;

/** Test-only: reset the cache so tests can exercise both branches. */
export function _resetWslTmuxCacheForTests(): void {
  _wslTmuxAvailabilityCache = null;
  _wslFallbackLogged = false;
}

function isWslTmuxAvailable(): boolean {
  // WSL tmux probe. Route through `buildSafeArgv` so there is NO
  // cmd.exe-as-shell in the path — `spawnSync("wsl", ["which", "tmux"])`
  // with windowsHide:true + shell:false keeps the console invisible.
  // `wsl.exe` itself still spins up WSL briefly, but that's background
  // (no visible window). Only invoked after `wt` is known absent.
  //
  // Cached for the server lifetime (see comment on _wslTmuxAvailabilityCache).
  if (_wslTmuxAvailabilityCache !== null) return _wslTmuxAvailabilityCache;
  try {
    const { argv, spawnOptions } = buildSafeArgv("wsl", ["which", "tmux"]);
    const r = spawnSync(argv[0], argv.slice(1), {
      stdio: "ignore",
      timeout: 1500,
      ...spawnOptions,
    });
    _wslTmuxAvailabilityCache = r.status === 0;
  } catch {
    _wslTmuxAvailabilityCache = false;
  }
  if (!_wslTmuxAvailabilityCache && !_wslFallbackLogged) {
    _wslFallbackLogged = true;
    console.error(
      "[spawn] Windows Terminal (wt.exe) not on PATH and WSL tmux unavailable \u2014 " +
      "falling back to headless session spawn. Install Windows Terminal for a " +
      "nicer UX: https://aka.ms/terminal",
    );
  }
  return _wslTmuxAvailabilityCache;
}

function dashboardSessionExists(): boolean {
  try {
    execSync("tmux has-session -t pi-dashboard 2>/dev/null", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Resolve pi as argv. Prefers node.exe + cli.js on Windows (avoids .cmd). */
function resolvePiCommand(): string[] | null {
  return resolver.resolvePi();
}

// ── Mechanism dispatch ─────────────────────────────────────────────────────

/**
 * Select the spawn mechanism for this invocation using lazy tool
 * availability probing. Each probe runs a subprocess, so we short-
 * circuit as soon as a mechanism is decided — crucially, the WSL
 * probe (`wsl which tmux`) spins up the WSL VM on Windows and is
 * the most expensive, so we only run it when wt is ALREADY known
 * absent and the user hasn't asked for headless.
 *
 * Ordering mirrors `selectMechanism`'s decision rules:
 *   1. electronMode or userStrategy=headless → no probes at all
 *   2. Unix → probe tmux only
 *   3. Windows → probe wt first; probe wsl-tmux only if wt is absent
 */
function chooseMechanism(options?: SessionOptions, electronMode = false): SpawnMechanism {
  const userStrategy: UserSpawnStrategy = options?.strategy === "headless" ? "headless" : "tmux";
  const platform = process.platform;

  // Short-circuit #1: headless requires no probes.
  if (electronMode || userStrategy === "headless") {
    return "headless";
  }

  // Unix: tmux or headless.
  if (platform === "linux" || platform === "darwin") {
    return selectMechanism({
      platform,
      userStrategy,
      electronMode,
      available: { tmux: isTmuxAvailable(), wt: false, wslTmux: false },
    });
  }

  // Windows: wt first (cheap `where wt`). Only probe WSL when wt is
  // absent — `wsl which tmux` starts the WSL VM and is slow + flashy.
  if (platform === "win32") {
    const wt = isWtAvailable();
    if (wt) {
      return selectMechanism({
        platform,
        userStrategy,
        electronMode,
        available: { tmux: false, wt: true, wslTmux: false },
      });
    }
    const wslTmux = isWslTmuxAvailable();
    return selectMechanism({
      platform,
      userStrategy,
      electronMode,
      available: { tmux: false, wt: false, wslTmux },
    });
  }

  // Unknown platform → headless.
  return "headless";
}

// ── Main entry point ───────────────────────────────────────────────────────

export async function spawnPiSession(
  cwd: string,
  options?: SessionOptions & { electronMode?: boolean },
): Promise<SpawnResult> {
  if (!existsSync(cwd)) {
    return { success: false, code: "DIR_MISSING", message: `Directory does not exist: ${cwd}` };
  }

  // Mint a spawn token if the caller didn't provide one. Token is injected
  // into the spawned process's env (via buildSpawnEnv) and surfaced on
  // SpawnResult so callers can register it with the registries.
  // See change: spawn-correlation-token.
  const spawnToken = options?.spawnToken ?? mintSpawnToken();
  const opts: SessionOptions & { electronMode?: boolean } = { ...(options ?? {}), spawnToken };

  const mechanism = chooseMechanism(opts, opts?.electronMode ?? false);

  let result: SpawnResult;
  switch (mechanism) {
    case "tmux":     result = spawnTmux(cwd, opts); break;
    case "wt":       result = await spawnWt(cwd, opts); break;
    case "wsl-tmux": result = spawnWslTmux(cwd, opts); break;
    case "headless": result = await spawnHeadless(cwd, opts); break;
  }
  // Surface the token on every result (success or failure) so callers
  // can clean up registries deterministically.
  return { ...result, spawnToken };
}

// ── Per-mechanism spawn ────────────────────────────────────────────────────

function spawnTmux(cwd: string, options?: SessionOptions): SpawnResult {
  const exists = dashboardSessionExists();
  const cmd = buildTmuxCommand(cwd, exists, options);
  // Pass env explicitly so PI_DASHBOARD_SPAWN_TOKEN reaches the tmux pane's
  // pi process (tmux inherits the caller's env into new windows/sessions).
  // See change: spawn-correlation-token.
  const env = buildSpawnEnv(process.env, { spawnToken: options?.spawnToken });
  try {
    execSync(cmd, { stdio: "ignore", env });
    return {
      success: true,
      dashboardSpawned: true,
      message: `Pi session spawned in tmux (${exists ? "new window" : "new session"})`,
    };
  } catch (err: any) {
    return { success: false, code: "TMUX_MISSING", message: `Failed to spawn session: ${err.message}` };
  }
}

function spawnWslTmux(cwd: string, options?: SessionOptions): SpawnResult {
  try {
    const cmd = `wsl ${buildTmuxCommand(cwd, false, options)}`;
    const env = buildSpawnEnv(process.env, { spawnToken: options?.spawnToken });
    execSync(cmd, { stdio: "ignore", env });
    return { success: true, dashboardSpawned: true, message: "Pi session spawned via WSL tmux" };
  } catch (err: any) {
    return { success: false, code: "TMUX_MISSING", message: `Failed to spawn via WSL tmux (wsl-tmux mechanism): ${err.message}` };
  }
}

async function spawnWt(cwd: string, options?: SessionOptions): Promise<SpawnResult> {
  const wt = resolver.which("wt");
  if (!wt) {
    return { success: false, code: "WT_MISSING", message: "Windows Terminal (wt.exe) not found" };
  }
  const piCmd = resolvePiCommand();
  if (!piCmd) {
    return { success: false, code: "PI_NOT_FOUND", message: `pi binary not found. Checked: ${MANAGED_BIN} and system PATH.` };
  }

  const piArgv = [...piCmd, ...buildInteractivePiArgs(options)];
  const args = buildWtArgs({ cwd, title: path.basename(cwd) || "pi", piArgv });

  const r = await spawnDetached({
    cmd: wt,
    args,
    cwd,
    env: buildSpawnEnv(process.env, { spawnToken: options?.spawnToken }),
  });

  if (!r.ok) {
    return { success: false, code: "SPAWN_ERRNO", message: `Failed to launch Windows Terminal: ${r.error}` };
  }

  return {
    success: true,
    dashboardSpawned: true,
    message: "Pi session spawned in Windows Terminal",
    pid: r.pid,
    process: r.process,
  };
}

async function spawnHeadless(cwd: string, options?: SessionOptions): Promise<SpawnResult> {
  const args = buildHeadlessArgs(options);
  const env = buildSpawnEnv(process.env, { spawnToken: options?.spawnToken });

  // RPC keeper sidecar path (feature-flagged). When enabled, both Unix and
  // Windows go through the keeper (uniform durability across OSes). Pi is
  // resolved here via the ToolRegistry and forwarded to the keeper as an
  // absolute argv (env var `PI_KEEPER_PI_CMD`); the keeper no longer relies
  // on bare PATH lookup. See change: fix-rpc-keeper-pi-resolution.
  if (shouldUseRpcKeeper()) {
    const piCmdForKeeper = resolvePiCommand();
    if (!piCmdForKeeper) {
      return { success: false, code: "PI_NOT_FOUND", message: `pi binary not found. Checked: ${MANAGED_BIN} and system PATH.` };
    }
    return spawnHeadlessViaKeeper(cwd, env, args, piCmdForKeeper);
  }

  const piCmd = resolvePiCommand();
  if (!piCmd) {
    return { success: false, code: "PI_NOT_FOUND", message: `pi binary not found. Checked: ${MANAGED_BIN} and system PATH.` };
  }
  const [bin, ...prefixArgs] = piCmd;

  const platform = process.platform;
  if (platform === "win32") {
    return spawnHeadlessDetached(cwd, bin, prefixArgs, args, env);
  }

  // Unix: use the sh -c "tail -f /dev/null | pi" wrapper so pi's stdin is
  // an internal pipe that survives GC. Pass through the detached-spawn
  // primitive so all the libuv defaults (detached, stdio, windowsHide) are
  // uniform. The wrapper is a domain-specific stdin-survival trick — it
  // belongs here (process-manager), not inside the primitive.
  const piLine = [shellEscape(bin), ...[...prefixArgs, ...args].map(shellEscape)].join(" ");
  const r = await spawnDetached({
    cmd: "sh",
    args: ["-c", `tail -f /dev/null | ${piLine}`],
    cwd,
    env,
  });
  if (!r.ok) {
    return { success: false, code: "SPAWN_ERRNO", message: `Failed to spawn headless (Unix): ${r.error}` };
  }
  return {
    success: true,
    dashboardSpawned: true,
    message: `Pi session spawned headless (pid ${r.pid})`,
    pid: r.pid,
    process: r.process,
  };
}

/**
 * RPC keeper sidecar headless spawn. Uniform across Unix + Windows.
 *
 * The keeper itself is a CJS-pure Node script (`rpc-keeper/keeper.cjs`).
 * It binds a per-session UDS / named pipe BEFORE spawning pi, then owns
 * pi's stdin pipe so it survives dashboard server restarts.
 *
 * Returned `pid` is the KEEPER PID (not pi's). Pi's PID is linked later
 * via the existing `session_register` token correlation path.
 *
 * Crash-detection window applies to KEEPER spawn only — the keeper itself
 * runs a separate 300 ms window on its pi child internally (and surfaces
 * the failure by exiting non-zero, which will be picked up by
 * `headless-pid-registry`'s PID-death tracking).
 *
 * See change: add-rpc-stdin-dispatch-with-keeper-sidecar (Phase 5).
 */
async function spawnHeadlessViaKeeper(
  cwd: string,
  env: NodeJS.ProcessEnv,
  piArgs: string[],
  piCmd: string[],
): Promise<SpawnResult> {
  // sessionId is what the keeper uses to derive its UDS / named-pipe path.
  // This is a TRANSPORT-side identifier, distinct from pi's session UUID
  // (which only exists once pi's RPC mode boots). We mint a fresh one per
  // spawn so the keeper's socket path is unique.
  const transportId = randomUUID();

  // piArgs already includes `--mode rpc` plus any per-spawn flags from
  // `buildHeadlessArgs(options)` (e.g. `--session-file <path>` for resume,
  // `--fork` for fork). Forwarding them through the keeper preserves the
  // existing resume / fork contract. See change: add-rpc-stdin-dispatch-with-keeper-sidecar.
  //
  // piCmd is the ToolRegistry-resolved absolute argv for pi (e.g.
  // ["/abs/path/pi"] on Unix or ["node","/abs/path/cli.js"] on Windows).
  // The keeper consumes it via env var `PI_KEEPER_PI_CMD` and spawns pi
  // without relying on its own PATH. See change: fix-rpc-keeper-pi-resolution.
  const km = getKeeperManager();
  const result = await km.spawnKeeperFor(transportId, cwd, env, piArgs, piCmd);
  if (!result.success || !result.pid || !result.process) {
    return {
      success: false,
      code: "SPAWN_ERRNO",
      message: `Failed to spawn RPC keeper: ${result.error ?? "unknown error"}`,
    };
  }

  // Crash-detection window on the keeper process itself. Keeper applies
  // its own 300 ms window to pi internally; this catches keeper-side
  // failures (bind failure, pi-spawn-error, etc.) that exit the keeper
  // within the window.
  const gate = await waitForNoCrash({ child: result.process, windowMs: 300 });
  if (!gate.ok) {
    return {
      success: false,
      code: "PI_CRASHED",
      message:
        `RPC keeper exited within crash window (code ${gate.exitCode}). ` +
        `Check ~/.pi/dashboard/sessions/keeper-${transportId}.log for details.`,
    };
  }

  return {
    success: true,
    dashboardSpawned: true,
    message: `Pi session spawned via RPC keeper (keeper pid ${result.pid}, transport ${transportId.slice(0, 8)})`,
    pid: result.pid,
    process: result.process,
    keeperSockPath: result.sockPath,
    // spawnToken propagated by the outer wrapper; keeper-spawn doesn't
    // mint its own. The token already lives in `env.PI_DASHBOARD_SPAWN_TOKEN`.
  };
}

/**
 * Windows headless spawn using the detached-spawn primitive.
 *
 * Key correctness fixes vs. the previous spawnHeadlessWindows:
 *   • detached: true            (via primitive) — excludes from libuv's
 *                                kill-on-close job; sessions survive
 *                                server restart.
 *   • shell: false              (via primitive) — sidesteps Node issue
 *                                #21825 and cmd.exe /d /s /c edge cases.
 *                                Requires pi to be [node.exe, cli.js],
 *                                NOT pi.cmd. If only pi.cmd is on PATH,
 *                                we surface an actionable error.
 *   • stdio[0] = "ignore"       — no parent-owned stdin pipe.
 *   • stdio[2] = logFd          — stderr to a persisted log file (not
 *                                a pipe that dies with the parent).
 *   • Crash window 300 ms       (was 1500 ms) — via waitForNoCrash.
 */
async function spawnHeadlessDetached(
  cwd: string,
  bin: string,
  prefixArgs: string[],
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<SpawnResult> {
  // Refuse to go through cmd.exe — the managed install must be present
  // so resolvePiCommand returned [node.exe, cli.js]. If someone has
  // only pi.cmd on PATH, point them at the wizard / managed install.
  if (bin.toLowerCase().endsWith(".cmd") || bin.toLowerCase().endsWith(".bat")) {
    return {
      success: false,
      code: "WIN_PI_CMD_ONLY",
      message:
        "Windows pi spawn requires node.exe + cli.js (managed install). " +
        "Found only pi.cmd on PATH. Run the dashboard setup wizard or " +
        "install pi via the dashboard's Packages view.",
    };
  }

  // Prepare a per-session log file for stderr capture.
  const logDir = path.join(os.homedir(), ".pi", "dashboard", "sessions");
  try { mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
  const logPath = path.join(logDir, `pi-spawn-${Date.now()}-${Math.floor(Math.random() * 1e6)}.log`);

  let logFd: number | undefined;
  try {
    logFd = openSync(logPath, "a");
  } catch {
    // If we can't open the log, proceed without stderr capture; still spawn.
    logFd = undefined;
  }

  const cmdForLog = `${bin} ${[...prefixArgs, ...args].join(" ")}`;
  console.error(`[spawn] Windows headless (detached): ${cmdForLog} (cwd=${cwd}, log=${logPath})`);

  // CRITICAL: pi's `--mode rpc` listens for `process.stdin.on("end")`
  // and calls shutdown() on EOF. With `stdio[0] = "ignore"`, stdin
  // closes immediately and pi exits before resume completes. Use a
  // parent-held pipe so pi's stdin stays open as long as the dashboard
  // server is alive.
  //
  // Trade-off: when the dashboard server process dies, Windows closes
  // the pipe handle, pi sees EOF, and shuts down. This is the opposite
  // of the Unix `sh -c "tail -f /dev/null | pi"` wrapper (which keeps
  // stdin open via an internal process-group pipe that survives
  // parent death). On Windows we accept "pi dies with dashboard" as
  // the cost of RPC mode working reliably. A future keeper-process
  // approach could restore the durability invariant.
  //
  // detach: false — restores the behaviour of commit d331850 that was
  // silently overridden by 5ab7956's universal `detached: true` invariant.
  // On Windows, `detached: true` allocates a new console for the child
  // unless all stdio slots are "ignore" (libuv `src/win/process.c` only
  // sets CREATE_NO_WINDOW when no slot has UV_INHERIT_FD). With `stdin:
  // "pipe"` we ALWAYS have UV_INHERIT_FD on stdio[0], so CREATE_NO_WINDOW
  // can never fire, and `windowsHide: true` only applies SW_HIDE after
  // allocation — producing brief console flashes on every session spawn.
  // `detach: false` keeps the child inside the parent's Job Object (no
  // new console needed — no flash). "pi dies with dashboard" invariant is
  // unchanged: stdin-EOF on parent death already ties them together.
  //
  // See change: prep-for-develop-merge.
  const r = await spawnDetached({
    cmd: bin,
    args: [...prefixArgs, ...args],
    cwd,
    env,
    logFd,
    stdinMode: "pipe",
    detach: false,
  });

  // We don't need the parent's copy of the log fd; the child has its own.
  if (logFd !== undefined) {
    try { closeSync(logFd); } catch { /* ignore */ }
  }

  if (!r.ok || !r.process || !r.pid) {
    return {
      success: false,
      code: "SPAWN_ERRNO",
      logPath: logFd !== undefined ? logPath : undefined,
      message: `Failed to spawn pi: ${r.error ?? "unknown error"}. Command: ${cmdForLog}`,
    };
  }

  // Short crash-detection window so we return fast on the happy path
  // but still catch immediate crashes (missing modules, config errors).
  const gate = await waitForNoCrash({ child: r.process, windowMs: 300 });
  if (!gate.ok) {
    // Read last 4 KB of stderr log for diagnostic forwarding. See change: spawn-failure-diagnostics.
    let stderrTail: string | undefined;
    if (logFd !== undefined) {
      stderrTail = readLogTail(logPath);
    }
    return {
      success: false,
      code: "PI_CRASHED",
      logPath: logFd !== undefined ? logPath : undefined,
      stderr: stderrTail,
      message:
        `Pi process exited immediately (code ${gate.exitCode}). ` +
        `See ${logPath} for details.\nCommand: ${cmdForLog}`,
    };
  }

  return {
    success: true,
    dashboardSpawned: true,
    message: `Pi session spawned headless (pid ${r.pid})`,
    pid: r.pid,
    process: r.process,
    logPath: logFd !== undefined ? logPath : undefined,
  };
}

/**
 * Read last `maxBytes` bytes of `filePath`, stripping leading UTF-8 continuation bytes.
 * Returns `undefined` on any error or if file is empty.
 * See change: spawn-failure-diagnostics.
 */
function readLogTail(filePath: string, maxBytes = 4096): string | undefined {
  try {
    const buf = readFileSync(filePath);
    if (!buf.length) return undefined;
    const slice = buf.length <= maxBytes ? buf : buf.slice(buf.length - maxBytes);
    // Strip leading UTF-8 continuation bytes (0x80..0xBF)
    let start = 0;
    while (start < slice.length && (slice[start]! & 0xC0) === 0x80) start++;
    return slice.slice(start).toString("utf-8");
  } catch {
    return undefined;
  }
}
