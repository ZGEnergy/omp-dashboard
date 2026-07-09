/**
 * Oh My Pi plugin manager adapter.
 *
 * Manages the OMP plugin directory at `~/.omp/plugins` using
 * Node fs/path + `bun install`/`bun uninstall`/`bun update` subprocesses.
 * Replaces the old pi DefaultPackageManager dynamic import approach.
 *
 * Plugin storage model:
 *   - `~/.omp/plugins/package.json` — dependency manifest
 *   - `~/.omp/plugins/node_modules/` — installed plugin packages
 *   - `~/.omp/plugins/omp-plugins.lock.json` — runtime enabled state
 *
 * Preserves the public API surface (`listInstalled`, `run`, `move`,
 * `checkUpdates`) so routes/UI keep working without changes.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { SubprocessAdapter } from "@blackbelt-technology/pi-dashboard-shared/platform/subprocess-adapter.js";
import { getDefaultSubprocessAdapter } from "@blackbelt-technology/pi-dashboard-shared/platform/subprocess-adapter.js";
import { fetchPackageMeta } from "./npm-search-proxy.js";
import { compareVersions } from "./pi-version-skew.js";

export interface ProgressEvent {
  type: "start" | "progress" | "complete" | "error";
  action: "install" | "remove" | "update" | "clone" | "pull";
  source: string;
  message?: string;
}

export type PackageScope = "global" | "local";
export type PackageAction = "install" | "remove" | "update" | "move";

export interface OperationRequest {
  action: "install" | "remove" | "update";
  source: string;
  scope: PackageScope;
  cwd?: string;
}

/**
 * OMP `extensions[]` entry. Either a bare source string or an object with
 * filter keys. Legacy `packages[]` entries are also accepted.
 */
export type PackageEntry = string | { source: string; [k: string]: unknown };

/** Move operation request. */
export interface MoveRequest {
  /** Full origin entry (string or filter object) — passed verbatim from the route. */
  entry: PackageEntry;
  fromScope: PackageScope;
  fromCwd?: string;
  toScope: PackageScope;
  toCwd?: string;
}

export interface OperationResult {
  operationId: string;
  /** `move` for composite move ops; `install`/`remove`/`update` otherwise. */
  action: PackageAction;
  /** When `action === "move"`, this is the destination scope. */
  scope: PackageScope;
  source: string;
  success: boolean;
  error?: string;
  /** Set on `action === "move"` only; ties together emitted events. */
  moveId?: string;
  /** Set on `action === "move"` when install succeeded but remove failed. */
  partialSuccess?: {
    installed: boolean;
    removed: boolean;
    removeError?: string;
  };
  /** Resolution diagnostics forwarded to clients on package_operation_complete. */
  diagnostics?: Record<string, unknown>;
}

export type ProgressListener = (operationId: string, event: ProgressEvent, moveId?: string) => void;
export type CompleteListener = (result: OperationResult) => void;


// ── OMP Plugin Directory ─────────────────────────────────────────────

const OMP_PLUGINS_DIR = path.join(os.homedir(), ".omp", "plugins");

function ensurePluginsDir(): void {
  fs.mkdirSync(OMP_PLUGINS_DIR, { recursive: true });
}

function pluginsPackageJsonPath(): string {
  return path.join(OMP_PLUGINS_DIR, "package.json");
}

function readPluginsPackageJson(): Record<string, unknown> {
  const p = pluginsPackageJsonPath();
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function writePluginsPackageJson(data: Record<string, unknown>): void {
  ensurePluginsDir();
  fs.writeFileSync(pluginsPackageJsonPath(), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function ensurePluginsPackageJsonExists(): void {
  ensurePluginsDir();
  const p = pluginsPackageJsonPath();
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify({ name: "omp-plugins", private: true, dependencies: {} }, null, 2) + "\n", "utf-8");
  }
}

/** Run a bun command in the plugins directory with inherited stdio. */
function runBun(adapter: SubprocessAdapter, args: string[]): void {
  ensurePluginsPackageJsonExists();
  const result = adapter.spawnSync("bun", args, {
    cwd: OMP_PLUGINS_DIR,
    stdio: "inherit",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`bun ${args[0]} exited with code ${result.status}`);
  }
}

/** Extract bare package name from an npm:source spec. */
function extractPackageName(source: string): string {
  const spec = source.startsWith("npm:") ? source.slice(4) : source;
  // Strip version suffix: @scope/name@1.0.0 → @scope/name
  const atIdx = spec.lastIndexOf("@");
  if (atIdx > 0) return spec.slice(0, atIdx);
  return spec;
}

/** Read version from a package's package.json in node_modules. */
function readInstalledVersion(pkgName: string): string | undefined {
  const pkgDir = path.join(OMP_PLUGINS_DIR, "node_modules", pkgName, "package.json");
  try {
    const raw = fs.readFileSync(pkgDir, "utf-8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

/** Read description from a package's package.json in node_modules. */
function readInstalledDescription(pkgName: string): string | undefined {
  const pkgDir = path.join(OMP_PLUGINS_DIR, "node_modules", pkgName, "package.json");
  try {
    const raw = fs.readFileSync(pkgDir, "utf-8");
    const parsed = JSON.parse(raw) as { description?: unknown };
    return typeof parsed.description === "string" ? parsed.description : undefined;
  } catch {
    return undefined;
  }
}

// ── Lockfile helpers ─────────────────────────────────────────────────

interface PluginsLockfile {
  plugins?: Record<string, { enabled?: boolean; version?: string; enabledFeatures?: string[] | null }>;
  settings?: Record<string, unknown>;
}

function readLockfile(): PluginsLockfile {
  const lockPath = path.join(OMP_PLUGINS_DIR, "omp-plugins.lock.json");
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf-8")) as PluginsLockfile;
  } catch {
    return {};
  }
}

function writeLockfile(data: PluginsLockfile): void {
  ensurePluginsDir();
  const lockPath = path.join(OMP_PLUGINS_DIR, "omp-plugins.lock.json");
  fs.writeFileSync(lockPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function upsertPluginLockEntry(pkgName: string, version: string, enabled: boolean): void {
  const lock = readLockfile();
  if (!lock.plugins) lock.plugins = {};
  lock.plugins[pkgName] = {
    ...(lock.plugins[pkgName] ?? {}),
    version,
    enabled,
  };
  writeLockfile(lock);
}

function removePluginLockEntry(pkgName: string): void {
  const lock = readLockfile();
  if (lock.plugins) {
    delete lock.plugins[pkgName];
  }
  if (lock.settings) {
    delete lock.settings[pkgName];
  }
  writeLockfile(lock);
}

// ── List installed ───────────────────────────────────────────────────

interface InstalledRow {
  source: string;
  scope: "user" | "project";
  filtered: boolean;
  installedPath?: string;
  version?: string;
  description?: string;
  displayName?: string;
}

function listPluginDependencies(): InstalledRow[] {
  const pkgJson = readPluginsPackageJson();
  const deps = (pkgJson.dependencies ?? {}) as Record<string, string>;
  const lock = readLockfile();
  const rows: InstalledRow[] = [];

  for (const [name, versionSpec] of Object.entries(deps)) {
    const isDisabled = lock.plugins?.[name]?.enabled === false;
    const version = readInstalledVersion(name);
    const description = readInstalledDescription(name);
    rows.push({
      source: `npm:${name}`,
      scope: "user",
      filtered: isDisabled,
      installedPath: path.join(OMP_PLUGINS_DIR, "node_modules", name),
      version: version ?? versionSpec,
      description,
      displayName: name,
    });
  }

  return rows;
}

// ── Main Wrapper ─────────────────────────────────────────────────────

export class PackageManagerWrapper {
  private busy = false;
  private onProgress: ProgressListener | undefined;
  private onComplete: CompleteListener | undefined;
  /** Called after successful operation; returns number of sessions reloaded. */
  private reloadSessions: (() => Promise<number>) | undefined;
  private subprocessAdapter: SubprocessAdapter;

  constructor(subprocessAdapter?: SubprocessAdapter) {
    this.subprocessAdapter = subprocessAdapter ?? getDefaultSubprocessAdapter();
  }

  setProgressListener(listener: ProgressListener | undefined) {
    this.onProgress = listener;
  }

  setCompleteListener(listener: CompleteListener | undefined) {
    this.onComplete = listener;
  }

  setReloadSessions(fn: (() => Promise<number>) | undefined) {
    this.reloadSessions = fn;
  }

  isBusy(): boolean {
    return this.busy;
  }

  /**
   * Run an arbitrary async operation under the wrapper's busy-lock.
   * Used by adjacent subsystems (e.g. PiCoreUpdater) to coordinate with
   * extension install/update operations. Throws PackageOperationBusyError
   * if a package operation is already running.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new PackageOperationBusyError();
    }
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Start a package operation. Returns the operationId immediately.
   * Progress and completion are delivered via listeners.
   * Throws if another operation is already running.
   */
  async run(req: OperationRequest): Promise<string> {
    if (this.busy) {
      throw new PackageOperationBusyError();
    }

    const operationId = crypto.randomUUID();
    this.busy = true;

    // Run async — don't await here so caller gets operationId immediately
    this.executeOperation(operationId, req).catch(() => {
      // errors handled inside executeOperation
    });

    return operationId;
  }

  /**
   * Move a package between scopes (global ↔ local).
   *
   * OMP plugin storage is global-only (~/.omp/plugins). Moving between
   * global and local scope has no OMP plugin equivalent and is not
   * supported. Throws InvalidMoveRequestError with a clear message.
   */
  async move(req: MoveRequest): Promise<string> {
    if (this.busy) {
      throw new PackageOperationBusyError();
    }

    if (req.fromScope === req.toScope) {
      throw new InvalidMoveRequestError("fromScope and toScope must differ");
    }

    // OMP plugins are global-only; local scope has no plugin storage equivalent.
    if (req.toScope === "local" || req.fromScope === "local") {
      throw new InvalidMoveRequestError(
        "Moving packages between global and local scope is not supported in Oh My Pi. " +
        "OMP plugins are managed globally at ~/.omp/plugins. " +
        "Use project-level .omp/settings.json extensions array for local configuration.",
      );
    }

    throw new InvalidMoveRequestError(
      "Move between scopes is not supported in Oh My Pi plugin storage. " +
      "Install or remove packages directly instead.",
    );
  }

  /**
   * List configured packages. For "global" scope, reads from OMP plugin
   * storage (~/.omp/plugins). For "local" scope, returns an empty list
   * since OMP does not have local-scope plugin installs.
   */
  async listInstalled(scope: PackageScope, _cwd?: string) {
    if (scope === "local") {
      return [];
    }
    return listPluginDependencies();
  }

  /**
   * Check for available updates. Compares installed versions against npm
   * registry latest metadata. Fails loudly on malformed registry responses.
   */
  async checkUpdates(_cwd?: string) {
    const installed = listPluginDependencies();
    const updates: Array<{ source: string; displayName: string; type: string; installedVersion?: string; latestVersion?: string }> = [];

    for (const row of installed) {
      const pkgName = extractPackageName(row.source);
      try {
        const meta = await fetchPackageMeta(pkgName);
        if (!meta?.version) {
          console.error(`[package-manager] Malformed registry response for ${pkgName}: missing version field`);
          continue;
        }
        const installedVersion = row.version ?? readInstalledVersion(pkgName);
        if (!installedVersion || compareVersions(installedVersion, meta.version) < 0) {
          updates.push({
            source: row.source,
            displayName: row.displayName ?? pkgName,
            type: "npm",
            installedVersion,
            latestVersion: meta.version,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Network errors are transient — log and continue to next package.
        // Non-ENOENT filesystem errors during version read are fatal.
        if (msg.includes("ENOENT")) continue;
        console.error(`[package-manager] Update check failed for ${pkgName}: ${msg}`);
      }
    }

    return updates;
  }

  // ── Internal ────────────────────────────────────────────────────

  private async executeOperation(operationId: string, req: OperationRequest, moveId?: string): Promise<void> {
    const result: OperationResult = {
      operationId,
      action: req.action,
      source: req.source,
      scope: req.scope,
      success: false,
      moveId,
    };

    // Yield to the event loop so run() can return the operationId to the
    // caller while the operation is still in flight (busy === true).
    await Promise.resolve();

    try {
      const source = req.source;

      this.onProgress?.(operationId, {
        type: "start",
        action: req.action,
        source,
        message: `Starting ${req.action}: ${source}`,
      }, moveId);

      switch (req.action) {
        case "install": {
          const pkgName = extractPackageName(source);
          ensurePluginsPackageJsonExists();

          // Add to dependencies
          const pkgJson = readPluginsPackageJson();
          const deps = (pkgJson.dependencies ?? {}) as Record<string, string>;
          deps[pkgName] = source.startsWith("npm:") ? source.slice(4) : source;
          pkgJson.dependencies = deps;
          writePluginsPackageJson(pkgJson);

          // Run bun install
          runBun(this.subprocessAdapter, ["install"]);

          // Read installed version for lockfile
          const installedVersion = readInstalledVersion(pkgName) ?? "unknown";
          upsertPluginLockEntry(pkgName, installedVersion, true);
          break;
        }
        case "remove": {
          const pkgName = extractPackageName(source);

          // Remove from dependencies
          const pkgJson = readPluginsPackageJson();
          const deps = (pkgJson.dependencies ?? {}) as Record<string, string>;
          delete deps[pkgName];
          pkgJson.dependencies = deps;
          writePluginsPackageJson(pkgJson);

          // Run bun uninstall
          runBun(this.subprocessAdapter, ["uninstall", pkgName]);

          // Remove from lockfile
          removePluginLockEntry(pkgName);
          break;
        }
        case "update": {
          const pkgName = source ? extractPackageName(source) : undefined;
          if (pkgName) {
            runBun(this.subprocessAdapter, ["update", pkgName]);
          } else {
            runBun(this.subprocessAdapter, ["update"]);
          }
          break;
        }
      }

      this.onProgress?.(operationId, {
        type: "complete",
        action: req.action,
        source,
        message: `${req.action} completed: ${source}`,
      }, moveId);

      result.success = true;

      // Reload all sessions. When called inside a move (moveId set),
      // skip — executeMove issues exactly one reload at the very end.
      if (this.reloadSessions && !moveId) {
        try {
          const count = await this.reloadSessions();
          (result as OperationResult & { sessionsReloaded?: number }).sessionsReloaded = count;
        } catch (err) {
          console.error("[package-manager] session reload failed:", err);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      result.error = message;
      // Re-throw so executeMove can detect failure and short-circuit.
      if (moveId) throw err;
    } finally {
      // When inside a move the busy lock is held by executeMove —
      // do NOT release it here. Don't fire the completion listener
      // either — executeMove emits a single composite "move" event.
      if (!moveId) {
        this.busy = false;
        this.onComplete?.(result);
      }
    }
  }
}

// ── Translate path source (kept for compatibility) ───────────────────

/**
 * Translate a path source between scopes.
 * To global → resolve to absolute against fromSettingsDir.
 * To local  → try path.relative(toSettingsDir, abs); keep absolute if
 * the relative form escapes the cwd tree by more than 2 `..` segments.
 */
export function translatePathSource(args: {
  originalSource: string;
  fromSettingsDir: string;
  toSettingsDir: string;
  toScope: PackageScope;
}): string {
  const { originalSource, fromSettingsDir, toSettingsDir, toScope } = args;
  const abs = path.isAbsolute(originalSource)
    ? path.normalize(originalSource)
    : path.resolve(fromSettingsDir, originalSource);

  if (toScope === "global") return abs;

  const rel = path.relative(toSettingsDir, abs);
  if (rel === "") return ".";
  const upSegments = rel.split(path.sep).filter((s) => s === "..").length;
  if (upSegments > 2) return abs;
  return rel;
}

// ── Error classes ────────────────────────────────────────────────────

export class AlreadyAtDestinationError extends Error {
  constructor(public source: string, public destScope: PackageScope) {
    super(`Package already installed at ${destScope} scope: ${source}`);
    this.name = "AlreadyAtDestinationError";
  }
}

export class InvalidMoveRequestError extends Error {
  constructor(reason: string) {
    super(`Invalid move request: ${reason}`);
    this.name = "InvalidMoveRequestError";
  }
}

export class UnsupportedSourceForDestinationError extends Error {
  constructor(reason: string) {
    super(`Unsupported source for destination: ${reason}`);
    this.name = "UnsupportedSourceForDestinationError";
  }
}

export class PackageOperationBusyError extends Error {
  constructor() {
    super("A package operation is already in progress");
    this.name = "PackageOperationBusyError";
  }
}
