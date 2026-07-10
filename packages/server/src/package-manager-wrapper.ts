/**
 * Oh My Pi package manager adapter.
 *
 * Manages the OMP plugin directory (`~/.omp/plugins`) using Node fs +
 * `bun install` / `bun uninstall` / `bun update` via SubprocessAdapter.
 * Replaces the upstream pi `DefaultPackageManager` which OMP no longer ships.
 *
 * Public surface preserved: listInstalled, run, move, checkUpdates,
 * progress/complete listeners, runExclusive.
 *
 * See: docs/plans/omp-host-contract.md Phase 4.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import {
  ModuleResolutionError,
  type ToolRegistry,
  type Resolution,
  getDefaultRegistry,
} from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";
import { getDefaultPluginsDir } from "@blackbelt-technology/pi-dashboard-shared/host-profile.js";
import {
  getDefaultSubprocessAdapter,
  type SubprocessAdapter,
} from "@blackbelt-technology/pi-dashboard-shared/platform/subprocess-adapter.js";
import { fetchPackageMeta } from "./npm-search-proxy.js";
import { compareVersions } from "./pi-version-skew.js";

export interface ProgressEvent {
  type: "start" | "progress" | "complete" | "error";
  action: "install" | "remove" | "update" | "clone" | "pull";
  source: string;
  message?: string;
}

/** Debug helper retained for diagnostic surfaces (resolution only). */
export function diagnosePiPackageManager(
  registry: ToolRegistry = getDefaultRegistry(),
): Resolution {
  return registry.resolve("pi-coding-agent");
}

export { ModuleResolutionError };

export type PackageScope = "global" | "local";
export type PackageAction = "install" | "remove" | "update" | "move";

export interface OperationRequest {
  action: "install" | "remove" | "update";
  source: string;
  scope: PackageScope;
  cwd?: string;
}

export type PackageEntry = string | { source: string; [k: string]: unknown };

export interface MoveRequest {
  entry: PackageEntry;
  fromScope: PackageScope;
  fromCwd?: string;
  toScope: PackageScope;
  toCwd?: string;
}

export interface OperationResult {
  operationId: string;
  action: PackageAction;
  scope: PackageScope;
  source: string;
  success: boolean;
  error?: string;
  moveId?: string;
  partialSuccess?: {
    installed: boolean;
    removed: boolean;
    removeError?: string;
  };
  diagnostics?: Resolution;
  sessionsReloaded?: number;
}

export type ProgressListener = (
  operationId: string,
  event: ProgressEvent,
  moveId?: string,
) => void;
export type CompleteListener = (result: OperationResult) => void;

// ── Plugins dir helpers ──────────────────────────────────────────────────────

function pluginsRootDir(): string {
  return getDefaultPluginsDir();
}

function ensurePluginsDir(): void {
  fs.mkdirSync(pluginsRootDir(), { recursive: true });
  fs.mkdirSync(path.join(pluginsRootDir(), "node_modules"), { recursive: true });
}

function pluginsPackageJsonPath(): string {
  return path.join(pluginsRootDir(), "package.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPluginsPackageJson(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(pluginsPackageJsonPath(), "utf-8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePluginsPackageJson(data: Record<string, unknown>): void {
  ensurePluginsDir();
  fs.writeFileSync(
    pluginsPackageJsonPath(),
    JSON.stringify(data, null, 2) + "\n",
    "utf-8",
  );
}

function ensurePluginsPackageJsonExists(): void {
  ensurePluginsDir();
  const p = pluginsPackageJsonPath();
  if (!fs.existsSync(p)) {
    fs.writeFileSync(
      p,
      JSON.stringify(
        { name: "omp-plugins", private: true, dependencies: {} },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
  }
}

function runBun(adapter: SubprocessAdapter, args: string[]): void {
  ensurePluginsPackageJsonExists();
  const result = adapter.spawnSync("bun", args, {
    cwd: pluginsRootDir(),
    stdio: "inherit",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`bun ${args[0]} exited with code ${result.status}`);
  }
}

/** Extract bare package name from an npm:source (or bare) spec. */
export function extractPackageName(source: string): string {
  const spec = source.startsWith("npm:") ? source.slice(4) : source;
  const atIdx = spec.lastIndexOf("@");
  if (atIdx > 0) return spec.slice(0, atIdx);
  return spec;
}

function readInstalledField(pkgName: string, field: "version" | "description"): string | undefined {
  const pkgDir = path.join(pluginsRootDir(), "node_modules", pkgName, "package.json");
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(pkgDir, "utf-8"));
    if (!isRecord(parsed)) return undefined;
    const value = parsed[field];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

interface PluginsLockfile {
  plugins?: Record<
    string,
    { enabled?: boolean; version?: string; enabledFeatures?: string[] | null }
  >;
  settings?: Record<string, unknown>;
}

function readLockfile(): PluginsLockfile {
  const lockPath = path.join(pluginsRootDir(), "omp-plugins.lock.json");
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    return isRecord(parsed) ? (parsed as PluginsLockfile) : {};
  } catch {
    return {};
  }
}

function writeLockfile(data: PluginsLockfile): void {
  ensurePluginsDir();
  const lockPath = path.join(pluginsRootDir(), "omp-plugins.lock.json");
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
  if (lock.plugins) delete lock.plugins[pkgName];
  if (lock.settings) delete lock.settings[pkgName];
  writeLockfile(lock);
}

export interface InstalledRow {
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
  const depsUnknown = pkgJson.dependencies;
  const deps = isRecord(depsUnknown) ? depsUnknown : {};
  const lock = readLockfile();
  const rows: InstalledRow[] = [];

  for (const [name, versionSpec] of Object.entries(deps)) {
    if (typeof versionSpec !== "string") continue;
    const isDisabled = lock.plugins?.[name]?.enabled === false;
    const version = readInstalledField(name, "version");
    const description = readInstalledField(name, "description");
    rows.push({
      source: `npm:${name}`,
      scope: "user",
      filtered: isDisabled,
      installedPath: path.join(pluginsRootDir(), "node_modules", name),
      version: version ?? versionSpec,
      description,
      displayName: name,
    });
  }
  return rows;
}

// ── Main Wrapper ─────────────────────────────────────────────────────────────

export class PackageManagerWrapper {
  private busy = false;
  private onProgress: ProgressListener | undefined;
  private onComplete: CompleteListener | undefined;
  private reloadSessions: (() => Promise<number>) | undefined;
  private subprocessAdapter: SubprocessAdapter;

  constructor(
    // Registry retained for API/diagnose compatibility; unused by plugins path.
    _registry?: ToolRegistry,
    subprocessAdapter?: SubprocessAdapter,
  ) {
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

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new PackageOperationBusyError();
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  async run(req: OperationRequest): Promise<string> {
    if (this.busy) throw new PackageOperationBusyError();
    const operationId = crypto.randomUUID();
    this.busy = true;
    this.executeOperation(operationId, req).catch(() => {
      /* handled inside */
    });
    return operationId;
  }

  /**
   * OMP plugins are global-only. Local scope moves are not supported.
   */
  async move(req: MoveRequest): Promise<string> {
    if (this.busy) throw new PackageOperationBusyError();
    if (req.fromScope === req.toScope) {
      throw new InvalidMoveRequestError("fromScope and toScope must differ");
    }
    if (req.toScope === "local" || req.fromScope === "local") {
      throw new InvalidMoveRequestError(
        "Moving packages between global and local scope is not supported in Oh My Pi. " +
          "OMP plugins are managed globally. Use project-level .omp/settings.json " +
          "extensions for local configuration.",
      );
    }
    throw new InvalidMoveRequestError(
      "Move between scopes is not supported in Oh My Pi plugin storage. " +
        "Install or remove packages directly instead.",
    );
  }

  async listInstalled(scope: PackageScope, _cwd?: string): Promise<InstalledRow[]> {
    if (scope === "local") return [];
    return listPluginDependencies();
  }

  async checkUpdates(_cwd?: string) {
    const installed = listPluginDependencies();
    const updates: Array<{
      source: string;
      displayName: string;
      type: string;
      installedVersion?: string;
      latestVersion?: string;
    }> = [];

    for (const row of installed) {
      const pkgName = extractPackageName(row.source);
      try {
        const meta = await fetchPackageMeta(pkgName);
        if (!meta?.version) continue;
        const installedVersion = row.version ?? readInstalledField(pkgName, "version");
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
        if (msg.includes("ENOENT")) continue;
        console.error(`[package-manager] Update check failed for ${pkgName}: ${msg}`);
      }
    }
    return updates;
  }

  private async executeOperation(
    operationId: string,
    req: OperationRequest,
    moveId?: string,
  ): Promise<void> {
    const result: OperationResult = {
      operationId,
      action: req.action,
      source: req.source,
      scope: req.scope,
      success: false,
      moveId,
    };

    // Yield so run() can return operationId while busy remains true.
    await Promise.resolve();

    try {
      const source = req.source;
      this.onProgress?.(
        operationId,
        {
          type: "start",
          action: req.action,
          source,
          message: `Starting ${req.action}: ${source}`,
        },
        moveId,
      );

      switch (req.action) {
        case "install": {
          const pkgName = extractPackageName(source);
          ensurePluginsPackageJsonExists();
          const pkgJson = readPluginsPackageJson();
          const depsUnknown = pkgJson.dependencies;
          const deps: Record<string, string> = isRecord(depsUnknown)
            ? Object.fromEntries(
                Object.entries(depsUnknown).filter(
                  (e): e is [string, string] => typeof e[1] === "string",
                ),
              )
            : {};
          deps[pkgName] = source.startsWith("npm:") ? source.slice(4) : source;
          pkgJson.dependencies = deps;
          writePluginsPackageJson(pkgJson);
          runBun(this.subprocessAdapter, ["install"]);
          const installedVersion = readInstalledField(pkgName, "version") ?? "unknown";
          upsertPluginLockEntry(pkgName, installedVersion, true);
          break;
        }
        case "remove": {
          const pkgName = extractPackageName(source);
          const pkgJson = readPluginsPackageJson();
          const depsUnknown = pkgJson.dependencies;
          const deps: Record<string, string> = isRecord(depsUnknown)
            ? Object.fromEntries(
                Object.entries(depsUnknown).filter(
                  (e): e is [string, string] => typeof e[1] === "string",
                ),
              )
            : {};
          delete deps[pkgName];
          pkgJson.dependencies = deps;
          writePluginsPackageJson(pkgJson);
          runBun(this.subprocessAdapter, ["uninstall", pkgName]);
          removePluginLockEntry(pkgName);
          break;
        }
        case "update": {
          const pkgName = source ? extractPackageName(source) : undefined;
          if (pkgName) runBun(this.subprocessAdapter, ["update", pkgName]);
          else runBun(this.subprocessAdapter, ["update"]);
          break;
        }
      }

      this.onProgress?.(
        operationId,
        {
          type: "complete",
          action: req.action,
          source,
          message: `${req.action} completed: ${source}`,
        },
        moveId,
      );

      result.success = true;

      if (this.reloadSessions && !moveId) {
        try {
          result.sessionsReloaded = await this.reloadSessions();
        } catch (err) {
          console.error("[package-manager] session reload failed:", err);
        }
      }
    } catch (err: unknown) {
      result.error = err instanceof Error ? err.message : String(err);
      if (moveId) throw err;
    } finally {
      if (!moveId) {
        this.busy = false;
        this.onComplete?.(result);
      }
    }
  }
}

/** Kept for call sites that still import path-source translation helpers. */
export function translatePathSource(args: {
  source: string;
  fromCwd: string;
  toCwd: string;
}): string {
  // Path-source moves are not used by OMP plugins; return source unchanged.
  void args.fromCwd;
  void args.toCwd;
  return args.source;
}

export class AlreadyAtDestinationError extends Error {
  constructor(message = "Package already present at destination") {
    super(message);
    this.name = "AlreadyAtDestinationError";
  }
}

export class InvalidMoveRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoveRequestError";
  }
}

export class UnsupportedSourceForDestinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSourceForDestinationError";
  }
}

export class PackageOperationBusyError extends Error {
  constructor(message = "A package operation is already in progress") {
    super(message);
    this.name = "PackageOperationBusyError";
  }
}
