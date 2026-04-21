/**
 * Shared bootstrap installer — single entry point for installing pi,
 * openspec, tsx, and recommended packages into the managed directory
 * (~/.pi-dashboard/). Callable from any entry point: Electron wizard,
 * `pi-dashboard` CLI first-run, `pi-dashboard upgrade-pi` subcommand,
 * and the `POST /api/bootstrap/upgrade-pi` REST handler.
 *
 * This module is deliberately free of Electron-specific concerns
 * (bundled-node, offline-bundle cacache, resourcesPath). Those remain
 * in `packages/electron/src/lib/dependency-installer.ts` which now
 * delegates its "install from npm registry" step to this function.
 *
 * See change: unified-bootstrap-install.
 */
import { spawn as cpSpawn } from "./platform/exec.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getManagedDir } from "./managed-paths.js";
import { getDefaultRegistry, type ToolRegistry } from "./tool-registry/index.js";

/**
 * Per-package progress tick. Mirrors the Electron `InstallProgress`
 * shape so existing wizard UI code needs no changes.
 */
export interface InstallProgress {
  step: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
  /** Last line of npm output (for streaming progress). */
  output?: string;
}

export type ProgressCallback = (progress: InstallProgress) => void;

export interface BootstrapInstallOptions {
  /** Packages to install via `npm install <pkg>` (registry fetch). */
  packages: string[];
  /** Root of the managed install. Defaults to `getManagedDir()`. */
  managedDir?: string;
  /** Called on every progress tick (pending/running/done/error). */
  progress?: ProgressCallback;
  /**
   * Optional override of the npm invocation. By default the function
   * resolves the `npm` tool via `ToolRegistry.resolve("npm")` and
   * falls back to the plain `npm` / `npm.cmd` binary on PATH. When
   * Electron wants to steer the install to bundled Node + npm-cli.js,
   * it passes the full argv prefix (e.g. `["<path>/node", "<path>/npm-cli.js"]`).
   */
  npmArgv?: string[];
  /**
   * Optional environment overrides merged into the child process env.
   * Electron uses this to put bundled Node on PATH for postinstall
   * scripts.
   */
  env?: NodeJS.ProcessEnv;
  /**
   * Inject a tool registry (tests). Defaults to `getDefaultRegistry()`.
   */
  registry?: ToolRegistry;
}

export interface BootstrapInstallSuccess {
  ok: true;
  installed: string[];
  managedDir: string;
}

export interface BootstrapInstallFailure {
  ok: false;
  error: string;
  installed: string[];
  managedDir: string;
}

export type BootstrapInstallResult = BootstrapInstallSuccess | BootstrapInstallFailure;

/** Ensure the managed directory exists with a package.json. */
export function ensureManagedDir(managedDir: string): void {
  mkdirSync(managedDir, { recursive: true });
  const pkgPath = path.join(managedDir, "package.json");
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      JSON.stringify({ name: "pi-dashboard-managed", private: true, type: "module" }, null, 2),
    );
  }
}

/**
 * Resolve the npm invocation used for bootstrap installs.
 *
 * Order:
 *   1. Explicit `npmArgv` override (Electron bundled-node case).
 *   2. `ToolRegistry.resolve("npm")`.
 *   3. Plain `npm` (Unix) or `npm.cmd` (Windows) on PATH.
 *
 * Returns the argv list that will have `install <packages...>` appended.
 */
export function resolveNpmArgv(
  opts: Pick<BootstrapInstallOptions, "npmArgv" | "registry">,
): string[] {
  if (opts.npmArgv && opts.npmArgv.length > 0) return [...opts.npmArgv];

  const registry = opts.registry ?? getDefaultRegistry();
  if (registry.has("npm")) {
    const res = registry.resolve("npm");
    if (res.ok && res.path) return [res.path];
  }

  // Last resort: rely on PATH. On Windows the .cmd shim is required
  // because spawn doesn't auto-append extensions.
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm"; // platform-branch-ok
  return [npmBin];
}

/** Internal: spawn npm with a given argv + packages; stream progress. */
function runNpmOnce(
  argvBase: string[],
  packages: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  onOutput?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const [cmd, ...baseArgs] = argvBase;
    if (!cmd) {
      reject(new Error("resolveNpmArgv returned an empty argv"));
      return;
    }
    const args = [...baseArgs, "install", ...packages];

    const child = cpSpawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    });

    let tail = "";

    const handleData = (data: Buffer): void => {
      const text = data.toString();
      tail += text;
      if (tail.length > 4096) tail = tail.slice(-4096);
      const lines = text.split("\n").filter((l) => l.trim());
      const last = lines[lines.length - 1];
      if (last && onOutput) onOutput(last.trim().substring(0, 120));
    };

    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);

    child.on("error", (err) => reject(new Error(err.message)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(tail.slice(-500) || `npm install exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Install the given packages into the managed directory.
 *
 * Per-package progress is reported via `progress`. Installation is
 * sequential (not concurrent) so a failure stops the chain — matching
 * the behavior of the Electron wizard today. The return value reports
 * which packages completed successfully before any failure.
 */
export async function bootstrapInstall(
  opts: BootstrapInstallOptions,
): Promise<BootstrapInstallResult> {
  const managedDir = opts.managedDir ?? getManagedDir();
  ensureManagedDir(managedDir);

  const argvBase = resolveNpmArgv(opts);
  const env = { ...process.env, ...(opts.env ?? {}) };

  const installed: string[] = [];
  for (const pkg of opts.packages) {
    const step = pkg.split("/").pop() || pkg;
    opts.progress?.({ step, status: "running" });
    try {
      await runNpmOnce(argvBase, [pkg], managedDir, env, (output) => {
        opts.progress?.({ step, status: "running", output });
      });
      opts.progress?.({ step, status: "done" });
      installed.push(pkg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.progress?.({ step, status: "error", error: message });
      return { ok: false, error: message, installed, managedDir };
    }
  }

  return { ok: true, installed, managedDir };
}

/**
 * Convenience wrapper: install pi, openspec, tsx into the default
 * managed directory. Used by the CLI degraded-mode first-run path.
 */
export async function bootstrapInstallDefaults(
  progress?: ProgressCallback,
): Promise<BootstrapInstallResult> {
  return bootstrapInstall({
    packages: ["@mariozechner/pi-coding-agent", "@fission-ai/openspec", "tsx"],
    progress,
  });
}
