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

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findBundledExtension } from "@blackbelt-technology/pi-dashboard-shared/bridge-register.js";
import type { SpawnFailureCode } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { loadConfig, type SpawnStrategy } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import { MANAGED_BIN } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";
import { ToolResolver } from "@blackbelt-technology/pi-dashboard-shared/platform/binary-lookup.js";
import {
  spawnDetached,
  waitForNoCrash,
} from "@blackbelt-technology/pi-dashboard-shared/platform/detached-spawn.js";
import type { ChildProcess } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import { buildSafeArgv, execFileSync, spawnSync } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import { prependManagedNodeToPath } from "@blackbelt-technology/pi-dashboard-shared/platform/managed-node-path.js";
import { electronAsNodeRequired } from "@blackbelt-technology/pi-dashboard-shared/platform/runner.js";
import {
  buildWtArgs,
  type SpawnMechanism,
  selectMechanism,
  sessionFlagsToArgv,
  type UserSpawnStrategy,
} from "@blackbelt-technology/pi-dashboard-shared/platform/spawn-mechanism.js";
import {
  createKeeperManager,
  type KeeperManager,
} from "./rpc-keeper/keeper-manager.js";
import { mintSpawnToken } from "./spawn-token.js";

const SERVER_REPO_BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function ompBridgeArgs(piCmd: string[]): string[] {
  if (!piCmd.some((arg) => path.basename(arg) === "omp")) return [];
  const extensionDir = findBundledExtension(SERVER_REPO_BASE);
  return extensionDir ? ["--extension", path.join(extensionDir, "src", "bridge.ts")] : [];
}

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

// ── Spawn dashboard target seam ──────────────────────────────────────────────
//
// piPort of the dashboard server that owns this process. Set once at server
// startup. Spawned pi sessions get `PI_DASHBOARD_URL=ws://localhost:<piPort>`
// so their bridge connects back to the server that spawned them — NOT the
// `config.piPort` default (9999). Without this, a second dashboard instance on
// a non-default `--pi-port` (e.g. a git-worktree server) spawns sessions that
// connect to the FIRST dashboard instead. The spawning server must own its
// spawns (spawn-token watchdog, session tracking), so this overrides any
// inherited `PI_DASHBOARD_URL`.
let spawnDashboardPiPort: number | null = null;

/** Set the owning server's piPort so spawned sessions connect back here. */
export function setSpawnDashboardPiPort(piPort: number | null): void {
  spawnDashboardPiPort = piPort;
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
  /**
   * Optional model id appended as `--model <model>` on the spawned pi
   * argv. Used by the automation-plugin run spawn. See change:
   * add-automation-plugin.
   */
  model?: string;
  advisor?: boolean;
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
   * RPC keeper UDS / named-pipe path. Set on every successful headless
   * spawn (the keeper is the only spawn mechanism for `--mode rpc`).
   * Callers pass this to `headlessPidRegistry.register(..., { keeperPid,
   * keeperSockPath })` so later `writeRpc` / `killBySessionId` calls can
   * locate the keeper. `pid` IS the keeper PID, so `keeperPid` is implicit.
   * See change: add-rpc-stdin-dispatch-with-keeper-sidecar,
   * enable-rpc-keeper-by-default.
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
/**
 * Strip Zellij client identity from dashboard-spawned session envs.
 *
 * Headless `omp --mode rpc` sessions inherit the dashboard server's process
 * env. When the server itself was started inside a Zellij pane (dev dogfood),
 * that includes `ZELLIJ` / `ZELLIJ_PANE_ID` / `ZELLIJ_SESSION_NAME` for the
 * *server's* pane. The tab-namer extension then treats the headless session as
 * owning that pane and renames the interactive tab — hijacking focus and
 * fighting Ctrl+T+R / `/rename`.
 *
 * Headless sessions are not attached to a Zellij pane; they must not carry
 * client identity.
 */
export function stripZellijClientEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  for (const key of Object.keys(env)) {
    if (key === "ZELLIJ" || key.startsWith("ZELLIJ_")) {
      delete env[key];
    }
  }
  return env;
}

export function buildSpawnEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  opts?: {
    spawnToken?: string;
    /**
     * The node-wrapped `argv[0]` this env will spawn (e.g. `piCmd[0]`).
     * When it is the Electron GUI binary (`execpath-fallback` topology),
     * re-add `ELECTRON_RUN_AS_NODE=1` that `resolver.buildSpawnEnv` strips.
     * Absent ⇒ env byte-identical to today. See change:
     * fix-nodescript-argv-electron-execpath-fallback.
     */
    argv0?: string;
    /** Injected `execPath`/`electronVersion` for deterministic tests. */
    electronDeps?: { execPath?: string; electronVersion?: string };
  },
): NodeJS.ProcessEnv {
  // Defensive copy: never mutate the caller's env (often `process.env`).
  const env = { ...prependManagedNodeToPath(resolver.buildSpawnEnv(baseEnv)) };
  // Headless/dashboard children must not inherit the server's Zellij pane identity.
  // See stripZellijClientEnv — prevents tab-namer hijack of interactive tabs.
  stripZellijClientEnv(env);
  // Re-add the Electron-as-node flag that `resolver.buildSpawnEnv` strips,
  // but ONLY when the argv[0] we are about to spawn is the Electron binary.
  // The argv-aware chokepoint that keeps this builder in agreement with
  // `runner.buildSpawnEnvForArgv`. No argv0 ⇒ no-op (byte-identical).
  if (opts?.argv0 && electronAsNodeRequired(opts.argv0, opts.electronDeps)) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }
  // Point spawned bridges at THIS server's gateway so they register with the
  // server that spawned them, not the config-default piPort. Overrides any
  // inherited PI_DASHBOARD_URL. See setSpawnDashboardPiPort above.
  if (spawnDashboardPiPort != null) {
    env.PI_DASHBOARD_URL = `ws://localhost:${spawnDashboardPiPort}`;
    // Pin the spawned bridge to THIS server: disable mDNS discovery so a
    // co-located dashboard (e.g. the user's real pi-dashboard advertising
    // _pi-dashboard._tcp on a different piPort) can't hijack the bridge off
    // our gateway via the post-register updateUrl() discovery override. Without
    // this the bridge registers here, then reconnects to whichever dashboard
    // mDNS surfaces — turn events then stream to THAT dashboard, and the
    // session created from our UI looks dead. See change: fix-keeper-mdns-hijack.
    env.PI_DASHBOARD_NO_MDNS = "1";
  }
  if (opts?.spawnToken) {
    // Inject the correlation token so the bridge inside the spawned pi
    // process can read it and echo back in `session_register`.
    // See change: spawn-correlation-token.
    env.PI_DASHBOARD_SPAWN_TOKEN = opts.spawnToken;
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
 * Build a tmux pane command to run pi in a new tmux window/session.
 * The pane command is passed as one tmux argv element.
 */
/**
 * Shell prefix that drops every `ZELLIJ*` variable from the pane environment.
 *
 * `buildSpawnEnv` strips these from the env passed to the *tmux client*, but
 * an already-running tmux server still injects its stored global/session env
 * into new windows. Unsetting inside the pane command is the reliable scrub
 * for that boundary (same attack: tab-namer hijack via inherited pane id).
 *
 * Uses POSIX `env -u` so we don't need bash-specific `unset`.
 */
export function zellijEnvUnsetPrefix(): string {
  // Explicit known keys + a small shell loop for any other ZELLIJ_* variants
  // the server may have cached (layout, socket, etc.).
  return "env -u ZELLIJ -u ZELLIJ_PANE_ID -u ZELLIJ_SESSION_NAME -u ZELLIJ_LAYOUT -u ZELLIJ_PANE_CONTENT -u ZELLIJ_SESSION";
}

function buildTmuxPaneCommand(
  cwd: string,
  piCmd: readonly string[],
  options?: SessionOptions,
): string {
  const safeCwd = shellEscape(cwd);
  const flags = sessionFlagsToArgv(options ?? {})
    .map(shellEscape)
    .join(" ");
  const resolvedPiInvocation = piCmd.map(shellEscape).join(" ");
  // Scrub Zellij client identity inside the pane (tmux session env may re-inject it).
  // Set the token inside the pane command as well: a long-lived tmux server
  // does not reliably propagate the client process environment, and WSL does
  // not inherit the Windows client environment into its Linux pane.
  const scrub = zellijEnvUnsetPrefix();
  const tokenEnv = options?.spawnToken
    ? ` PI_DASHBOARD_SPAWN_TOKEN=${shellEscape(options.spawnToken)}`
    : "";
  const piInvocation = `${scrub}${tokenEnv} ${resolvedPiInvocation}`;
  return flags
    ? `cd ${safeCwd} && ${piInvocation} ${flags}`
    : `cd ${safeCwd} && ${piInvocation}`;
}

/**
 * Build the tmux client argv. The pane command is deliberately one argv element:
 * tmux passes it to exactly one pane shell, rather than an outer Node shell
 * parsing OMP arguments before tmux sees them.
 */
function buildTmuxArgs(
  cwd: string,
  sessionExists: boolean,
  piCmd: readonly string[],
  options?: SessionOptions,
): string[] {
  const paneCommand = buildTmuxPaneCommand(cwd, piCmd, options);
  if (sessionExists) {
    return ["new-window", "-t", "pi-dashboard", "-c", cwd, paneCommand];
  }
  return ["new-session", "-d", "-s", "pi-dashboard", "-c", cwd, paneCommand];
}

/**
 * Build a human-readable tmux command. Production launches use buildTmuxArgs
 * with execFileSync so this string is never passed through an outer shell.
 */
export function buildTmuxCommand(
  cwd: string,
  sessionExists: boolean,
  piCmd: readonly string[],
  options?: SessionOptions,
): string {
  const safeCwd = shellEscape(cwd);
  const paneCommand = buildTmuxPaneCommand(cwd, piCmd, options);
  if (sessionExists) {
    return `tmux new-window -t pi-dashboard -c ${safeCwd} "${paneCommand}"`;
  }
  return `tmux new-session -d -s pi-dashboard -c ${safeCwd} "${paneCommand}"`;
}

function powershellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

type ManagedOmpPackage = {
  name?: unknown;
  bin?: unknown;
  engines?: { bun?: unknown; node?: unknown };
};

/**
 * Convert the managed OMP npm `.cmd` shim into the executable and CLI script it
 * represents. PowerShell delegates `.cmd` files to cmd.exe, which reparses
 * metacharacters after our encoded payload. Only the exact managed OMP shim is
 * unwrapped; arbitrary third-party `.cmd` executables retain their resolver
 * behaviour.
 */
function normalizeManagedOmpCmd(piArgv: readonly string[]): string[] | null {
  const [cmd, ...args] = piArgv;
  if (!cmd) return [...piArgv];

  // Resolver paths are Windows paths whenever the server runs on Windows,
  // regardless of whether the resolver spelled them with `\` or `/`.
  // The platform seam in tests mocks process.platform, so do not infer the
  // path flavour from the candidate's separator spelling.
  const pathApi = process.platform === "win32" ? path.win32 : path.posix;
  const managedBin = pathApi.normalize(MANAGED_BIN);
  const managedCmd = pathApi.normalize(cmd);
  const managedCmdDir = pathApi.dirname(managedCmd);
  const samePath = pathApi === path.win32
    ? managedCmdDir.toLowerCase() === managedBin.toLowerCase()
    : managedCmdDir === managedBin;
  if (pathApi.basename(managedCmd).toLowerCase() !== "omp.cmd" || !samePath) {
    return [...piArgv];
  }

  const packageDir = pathApi.join(pathApi.dirname(managedBin), "@oh-my-pi", "pi-coding-agent");
  const packageJsonPath = pathApi.join(packageDir, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as ManagedOmpPackage;
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin && typeof pkg.bin === "object"
      ? (pkg.bin as Record<string, unknown>).omp
      : null;
    if (
      pkg.name !== "@oh-my-pi/pi-coding-agent"
      || typeof bin !== "string"
      || bin.length === 0
      || pathApi.isAbsolute(bin)
    ) {
      return null;
    }

    const script = pathApi.resolve(packageDir, bin);
    const canonicalPackageDir = pathApi.normalize(realpathSync(packageDir));
    const canonicalScript = pathApi.normalize(realpathSync(script));
    const canonicalPackageForCompare = pathApi === path.win32
      ? canonicalPackageDir.toLowerCase()
      : canonicalPackageDir;
    const canonicalScriptForCompare = pathApi === path.win32
      ? canonicalScript.toLowerCase()
      : canonicalScript;
    const relativeScript = pathApi.relative(canonicalPackageForCompare, canonicalScriptForCompare);
    if (
      relativeScript === ""
      || relativeScript === ".."
      || relativeScript.startsWith(`..${pathApi.sep}`)
      || pathApi.isAbsolute(relativeScript)
      || !statSync(canonicalScript).isFile()
    ) {
      return null;
    }

    const runtime = typeof pkg.engines?.bun === "string"
      ? resolver.which("bun")
      : typeof pkg.engines?.node === "string"
        ? resolver.resolveNode()
        : null;
    if (typeof runtime !== "string" || runtime.length === 0) return null;
    const runtimeExt = pathApi.extname(runtime).toLowerCase();
    if (runtimeExt === ".cmd" || runtimeExt === ".bat") return null;
    return [runtime, canonicalScript, ...args];
  } catch {
    return null;
  }
}

/**
 * Windows Terminal's `-w 0` server owns the tab environment, so the token must
 * be set by the tab's child command. An encoded PowerShell script avoids
 * cmd.exe's second parse, including `%NAME%` expansion in arbitrary OMP argv.
 */
function buildWtChildArgv(piArgv: readonly string[], spawnToken?: string): string[] {
  const [pi, ...piArgs] = piArgv;
  const script = [
    spawnToken ? `$env:PI_DASHBOARD_SPAWN_TOKEN = ${powershellLiteral(spawnToken)}` : "",
    `$pi = ${powershellLiteral(pi ?? "")}`,
    `$piArgs = @(${piArgs.map(powershellLiteral).join(", ")})`,
    "& $pi @piArgs",
  ].filter(Boolean).join("; ");
  return [
    "powershell.exe",
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64"),
  ];
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

function dashboardSessionExists(tmux: string): boolean {
  try {
    execFileSync(tmux, ["has-session", "-t", "pi-dashboard"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Resolve pi as argv. Prefers node.exe + cli.js on Windows (avoids .cmd). */
function resolvePiCommand(): string[] | null {
  return resolver.resolvePi();
}

/** Resolve OMP from the Linux side of WSL; host Windows resolution is unusable in a Linux pane. */
function resolveWslPiCommand(): string[] | null {
  try {
    const { argv, spawnOptions } = buildSafeArgv(
      "wsl.exe",
      ["--exec", "sh", "-lc", "command -v omp"],
    );
    const result = spawnSync<string>(argv[0], argv.slice(1), {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      ...spawnOptions,
    });
    const pi = result.status === 0 ? result.stdout.trim().split(/\r?\n/, 1)[0] : "";
    return pi ? [pi] : null;
  } catch {
    return null;
  }
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
  const piCmd = resolvePiCommand();
  if (!piCmd) {
    return { success: false, code: "PI_NOT_FOUND", message: `pi binary not found. Checked: ${MANAGED_BIN} and system PATH.` };
  }
  const tmux = resolver.which("tmux");
  if (!tmux) {
    return { success: false, code: "TMUX_MISSING", message: "tmux binary not found" };
  }
  const exists = dashboardSessionExists(tmux);
  const args = buildTmuxArgs(cwd, exists, piCmd, options);
  // The token is also set in the pane command because an existing tmux server
  // can retain its own environment. Passing the client env covers new servers.
  const env = buildSpawnEnv(process.env, { spawnToken: options?.spawnToken, argv0: piCmd[0] });
  try {
    execFileSync(tmux, args, { stdio: "ignore", env });
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
  const piCmd = resolveWslPiCommand();
  if (!piCmd) {
    return { success: false, code: "PI_NOT_FOUND", message: "pi binary not found in WSL. Checked Linux PATH." };
  }
  try {
    const args = ["--exec", "tmux", ...buildTmuxArgs(cwd, false, piCmd, options)];
    // The token is set in the pane command. Retain the sanitized parent env for
    // WSL itself, but never derive a Linux pane executable from the host resolver.
    const env = buildSpawnEnv(process.env, { spawnToken: options?.spawnToken });
    execFileSync("wsl.exe", args, { stdio: "ignore", env });
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

  const piArgv = normalizeManagedOmpCmd([...piCmd, ...buildInteractivePiArgs(options)]);
  if (!piArgv) {
    return { success: false, code: "PI_NOT_FOUND", message: "Managed OMP runtime or CLI script not found" };
  }
  // `-w 0` connects to an existing Windows Terminal server, which does not
  // inherit the wt.exe client's environment. Set the token in the per-tab
  // child command so the bridge sees it regardless of terminal reuse.
  const args = buildWtArgs({
    cwd,
    title: path.basename(cwd) || "pi",
    piArgv: buildWtChildArgv(piArgv, options?.spawnToken),
  });

  const r = await spawnDetached({
    cmd: wt,
    args,
    cwd,
    // Pass the actual child executable so Electron-as-node is restored only
    // when the encoded Windows Terminal payload invokes Electron itself.
    env: buildSpawnEnv(process.env, { spawnToken: options?.spawnToken, argv0: piArgv[0] }),
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
  // Headless `--mode rpc` sessions are spawned through the RPC keeper sidecar
  // on every platform. The keeper owns pi's stdin pipe (so pi survives
  // dashboard server restarts) and exposes a per-session UDS / named pipe
  // the server writes RPC `prompt` lines to (so typed extension slash commands
  // like `/ctx-stats` dispatch in headless sessions).
  // See change: add-rpc-stdin-dispatch-with-keeper-sidecar (introduced keeper),
  //             enable-rpc-keeper-by-default (made keeper the only path).
  const piCmd = resolvePiCommand();
  const args = piCmd ? [...buildHeadlessArgs(options), ...ompBridgeArgs(piCmd)] : [];
  if (!piCmd) {
    return { success: false, code: "PI_NOT_FOUND", message: `pi binary not found. Checked: ${MANAGED_BIN} and system PATH.` };
  }
  // Build env AFTER resolving piCmd so the node-wrapped pi argv[0] re-adds
  // the Electron-as-node flag when it is the Electron binary. This env is
  // the keeper's base env, so the forwarded pi child inherits the flag too.
  const env = buildSpawnEnv(process.env, { spawnToken: options?.spawnToken, argv0: piCmd[0] });
  return spawnHeadlessViaKeeper(cwd, env, args, piCmd);
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

  // Gate capture of pi's stdout/stderr into keeper-<id>.log on the opt-in
  // config flag (default OFF). Read at spawn time so toggling takes effect on
  // the next spawn without a server restart. The keeper reads this env var to
  // pick its pi-child stdio sink. See change: add-keeper-output-capture-toggle.
  if (loadConfig().keeperLog.capturePiOutput) {
    env = { ...env, PI_KEEPER_CAPTURE_PI_OUTPUT: "1" };
  }

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

// Legacy `spawnHeadlessDetached` (Windows direct-stdin pipe) and
// `readLogTail` removed 2026-05-28 by change `enable-rpc-keeper-by-default`.
// All headless `--mode rpc` spawns now go through `spawnHeadlessViaKeeper`,
// which owns pi's stdin via the per-session keeper sidecar and survives
// dashboard server restarts uniformly across Unix and Windows.
