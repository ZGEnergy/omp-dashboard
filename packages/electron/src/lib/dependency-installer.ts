/**
 * Electron-specific wrapper over the shared bootstrap installer.
 *
 * The core registry-install loop (resolve npm, run `npm install <pkg>`,
 * stream progress) lives in `@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js`
 * and is called from here with Electron-specific concerns layered on top:
 *   - bundled Node + npm-cli.js for fresh installs with no system Node
 *   - offline cacache bundle (resourcesPath/offline-packages/)
 *   - bundled-extensions activation in pi's git cache
 *
 * See change: unified-bootstrap-install.
 */
import { exec, spawn as cpSpawn, spawnSync as cpSpawnSync } from "@blackbelt-technology/pi-dashboard-shared/platform/exec.js";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getBundledNodePath, getBundledNpmPath } from "./bundled-node.js";
import { getDefaultRegistry } from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";
import { installManagedNode } from "@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js";
import {
  getManagedNodeBinary,
  isManagedNodePresent,
  prependManagedNodeToPath,
} from "@blackbelt-technology/pi-dashboard-shared/platform/managed-node-path.js";
import { MANAGED_DIR } from "./managed-paths.js";
import {
  resolveOfflinePackages,
  extractOfflineCache,
  buildOfflineInstallArgs,
  selectInstallStrategy,
} from "./offline-packages.js";
import { rmSync } from "node:fs";
import {
  bootstrapInstall as sharedBootstrapInstall,
  type InstallProgress as SharedInstallProgress,
} from "@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js";

/**
 * Re-export the shared installer for back-compat. Consumers that imported
 * `bootstrapInstall` from this module continue to work; new code should
 * import directly from `@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js`.
 */
export { bootstrapInstall } from "@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js";

export interface InstallProgress {
  step: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
  /** Last line of npm output (for streaming progress) */
  output?: string;
}

export type ProgressCallback = (progress: InstallProgress) => void;

/** Ensure the managed directory exists with a package.json. */
function ensureManagedDir(): void {
  mkdirSync(MANAGED_DIR, { recursive: true });
  const pkgPath = path.join(MANAGED_DIR, "package.json");
  if (!existsSync(pkgPath)) {
    writeFileSync(pkgPath, JSON.stringify({ name: "pi-dashboard-managed", private: true, type: "module" }, null, 2));
  }
}

/** Resolve the npm command to use (managed > bundled > system).
 *
 * Order:
 *   1. Managed Node runtime (`<managedDir>/node/...`) when installed by
 *      `installManagedNode`. Persistent across Electron upgrades and
 *      always present once first-run install completes.
 *      See change: embed-managed-node-runtime.
 *   2. Bundled Node + npm-cli.js (`<app>/resources/node/...`). Used
 *      before the managed copy exists (i.e. the very first call inside
 *      `installStandalone`).
 *   3. System npm via PATH (Unix only — Windows would hit the npm.cmd
 *      ENOENT issue without the .cmd extension).
 *
 * On Windows, both managed and bundled paths use
 * `"<node.exe>" "<npm-cli.js>"` to bypass the .cmd shim entirely.
 */
/**
 * Verify that an `<node> <npm-cli.js> --version` invocation actually works.
 * Used to detect a partial / corrupted managed-npm copy on Windows (MAX_PATH,
 * AV interference, non-ASCII home dir failures) before we commit to using it.
 * Returns true on `--version` exit 0 with a `X.Y.Z`-shaped stdout.
 * See change: spawn-failure-diagnostics.
 */
function verifyNpmWorks(nodeBin: string, npmCliJs: string): boolean {
  try {
    const r = cpSpawnSync(nodeBin, [npmCliJs, "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
      encoding: "utf-8",
    });
    if (r.status !== 0) return false;
    const out = (r.stdout ?? "").toString().trim();
    return /^\d+\.\d+\.\d+/.test(out);
  } catch {
    return false;
  }
}

function resolveNpm(): string {
  // 1. Managed runtime first (when installed and verified working).
  // The dashboard server + bridge resolve node/npm via the same `MANAGED_DIR`
  // path, so we want managed to be the canonical install. But cpSync can leave
  // a partial copy on Windows (MAX_PATH, antivirus interference, non-ASCII
  // home dirs) that loads `npm` enough to print --help but crashes on real
  // commands. Verify with a fast `--version` probe before committing.
  // See change: spawn-failure-diagnostics.
  if (isManagedNodePresent()) {
    const managedNode = getManagedNodeBinary();
    const managedNpmCli = process.platform === "win32" // platform-branch-ok: npm-cli.js layout differs Windows vs Unix
      ? path.join(MANAGED_DIR, "node", "node_modules", "npm", "bin", "npm-cli.js")
      : path.join(MANAGED_DIR, "node", "lib", "node_modules", "npm", "bin", "npm-cli.js");
    if (existsSync(managedNpmCli) && verifyNpmWorks(managedNode, managedNpmCli)) {
      return `"${managedNode}" "${managedNpmCli}"`;
    }
  }

  // 2. Bundled Electron resources — fallback when managed copy is broken or
  // hasn't been installed yet. Sitting next to pi-dashboard.exe in resources/.
  const nodePath = getBundledNodePath();
  const npmPath = getBundledNpmPath();
  if (process.platform === "win32" && nodePath && npmPath) {
    return `"${nodePath}" "${npmPath}"`;
  }
  // 3. System npm on Unix (posix has no extension issue). Use the shared
  // registry so the same node-resolution strategy applies across Electron
  // and the CLI. See change: unified-bootstrap-install.
  const registry = getDefaultRegistry();
  if (registry.has("node")) {
    const nodeRes = registry.resolve("node");
    if (nodeRes.ok) return "npm";
  }
  // Fallback: bundled even on non-Windows.
  if (nodePath && npmPath) {
    return `"${nodePath}" "${npmPath}"`;
  }
  throw new Error("No Node.js available. Cannot install dependencies.");
}

/**
 * Build env with managed Node + bundled Node on PATH so postinstall
 * scripts can find `node` / `npm`. Managed first (when present) so
 * children resolve to the persistent runtime; bundled second as a
 * fallback for the very first install before the managed copy exists.
 *
 * See change: embed-managed-node-runtime.
 */
function buildInstallEnv(): NodeJS.ProcessEnv {
  // Start with managed-node prepend (no-op when not yet installed).
  let env = prependManagedNodeToPath(process.env);
  const nodePath = getBundledNodePath();
  if (nodePath) {
    const binDir = path.dirname(nodePath);
    if (!(env.PATH ?? "").split(path.delimiter).includes(binDir)) {
      env = { ...env, PATH: `${binDir}${path.delimiter}${env.PATH || ""}` };
    }
  }
  return env;
}

/** Run npm install asynchronously with streaming output. */
function runNpmInstall(
  packages: string[],
  cwd: string,
  npmCmd: string,
  onOutput?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = buildInstallEnv();
    // Parse npmCmd into command + args (handles "node" "npm-cli.js" form)
    const parts = npmCmd.match(/"[^"]+"|\S+/g)?.map(s => s.replace(/^"|"$/g, "")) || [npmCmd];
    const cmd = parts[0];
    const args = [...parts.slice(1), "install", ...packages];

    const child = cpSpawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    });

    let stderr = "";

    const handleData = (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      // Forward last meaningful line to UI
      const lines = text.split("\n").filter(l => l.trim());
      const last = lines[lines.length - 1];
      if (last && onOutput) {
        onOutput(last.trim().substring(0, 120));
      }
    };

    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);

    child.on("error", (err) => reject(new Error(err.message)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.slice(-500) || `npm install exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Standalone mode: install all tools into ~/.pi-dashboard/.
 *
 * When an offline package bundle is present under
 * `<resourcesPath>/offline-packages/`, the install runs entirely from
 * that bundled cacache (no network). On any offline-path failure, the
 * cache is preserved for debugging and the error is surfaced — we do
 * NOT silently fall back to the registry (contract: deterministic
 * offline install).
 *
 * When the bundle is absent (dev builds, opt-in flag off in CI), the
 * old per-package registry loop runs unchanged.
 */
export async function installStandalone(onProgress?: ProgressCallback, skipPackages?: string[]): Promise<void> {
  ensureManagedDir();

  // Install the managed Node runtime first — the very next npm spawn
  // (and every future one, including the Update button) resolves
  // node/npm out of <managedDir>/node/ via the ToolRegistry. No-ops
  // when running outside Electron (no bundled resources).
  // See change: embed-managed-node-runtime.
  const bundledNodeBinary = getBundledNodePath();
  // bundledNodeDir is the parent of `node.exe` on Win or grandparent
  // of `bin/node` on Unix — i.e. the dir laid out as the upstream Node
  // distribution.
  const bundledNodeDir = bundledNodeBinary
    ? (process.platform === "win32" // platform-branch-ok: Node distribution layout differs Windows vs Unix
        ? path.dirname(bundledNodeBinary)
        : path.dirname(path.dirname(bundledNodeBinary)))
    : null;
  const managedNodeRes = await installManagedNode({
    bundledNodeDir,
    managedDir: MANAGED_DIR,
    progress: onProgress as unknown as (p: SharedInstallProgress) => void,
  });
  if (!managedNodeRes.ok) {
    // Continue even if the managed Node copy failed — the bundled
    // fallback in resolveNpm() still works for this install. Just
    // log so QA can spot it.
    console.error("[dependency-installer] installManagedNode failed:", managedNodeRes.error);
  }

  const npmCmd = resolveNpm();

  // Note: @blackbelt-technology/pi-dashboard is bundled with the Electron app
  // (server CLI in extraResources), so it's not installed via npm.
  const packages = [
    "@mariozechner/pi-coding-agent",
    "@fission-ai/openspec",
    "tsx",
  ];

  const skipSet = new Set(skipPackages || []);

  // Offline fast path: if the bundle is present AND skipSet doesn't already
  // cover everything, extract the cacache and run ONE cache-offline npm
  // install for the outstanding packages.
  const outstanding = packages.filter(p => !skipSet.has(p));
  const resourcesPath = (process as any).resourcesPath as string | undefined;
  const resolution = resourcesPath
    ? resolveOfflinePackages(resourcesPath)
    : { present: false as const, reason: "no resourcesPath" };
  const strategy = selectInstallStrategy({ outstandingPackages: outstanding, resolution });

  if (strategy.kind === "offline" && resolution.present) {
    try {
      await runOfflineInstall({
        resolution,
        outstanding,
        pinMap: strategy.pinMap,
        npmCmd,
        onProgress,
      });
      // Mark skipped-already entries for wizard UI completeness
      for (const pkg of packages.filter(p => skipSet.has(p))) {
        const step = pkg.split("/").pop() || pkg;
        onProgress?.({ step, status: "done", output: "Already installed (system)" });
      }
      return;
    } catch (err: any) {
      // Offline path failed (cache key mismatch, npm internal crash on the
      // user's npmrc, non-ASCII path issue, etc.). Don't block the user —
      // fall through to the registry install path. The wizard's per-package
      // rows are reset to "running" by the registry install. Log the offline
      // failure for diagnostics.
      // See change: spawn-failure-diagnostics.
      console.error("[dependency-installer] Offline install failed, falling back to registry:", err?.message ?? err);
      onProgress?.({
        step: "offline-install",
        status: "error",
        error: `Offline cache failed (${err?.message ?? "unknown"}) — falling back to registry`,
      });
      // Mark each per-package row back to "running" so the user sees the
      // registry install starting fresh.
      for (const id of outstanding.map((n) => n.split("/").pop()!)) {
        onProgress?.({ step: id, status: "running", output: "Falling back to registry…" });
      }
      // Continue past the offline branch into the registry install below.
    }
  }

  if (strategy.kind === "offline-incomplete") {
    onProgress?.({
      step: "offline-cache",
      status: "error",
      error: `Bundled cache is missing pins for: ${strategy.missing.join(", ")} — using registry`,
    });
  }

  // Registry fallback (no bundle, or bundle incomplete).
  //
  // Delegate to the shared `bootstrapInstall`. We still need to emit
  // per-package "Already installed (system)" ticks for skipped packages
  // because the shared installer isn't aware of the Electron-specific
  // `skipPackages` semantics.
  for (const pkg of packages) {
    const step = pkg.split("/").pop() || pkg;
    if (skipSet.has(pkg)) {
      onProgress?.({ step, status: "done", output: "Already installed (system)" });
    }
  }

  const toInstall = packages.filter((p) => !skipSet.has(p));
  if (toInstall.length === 0) return;

  const argvBase = parseNpmArgv(npmCmd);
  const env = buildInstallEnv();
  const res = await sharedBootstrapInstall({
    packages: toInstall,
    managedDir: MANAGED_DIR,
    npmArgv: argvBase,
    env,
    progress: onProgress as unknown as (p: SharedInstallProgress) => void,
  });
  if (!res.ok) {
    throw new Error(res.error);
  }
}

/** Parse an `npmCmd` string (may contain quoted paths) into an argv array. */
function parseNpmArgv(npmCmd: string): string[] {
  return (
    npmCmd.match(/"[^"]+"|\S+/g)?.map((s) => s.replace(/^"|"$/g, "")) ?? [npmCmd]
  );
}

/**
 * Run the bundled-cacache install path. Three discrete progress steps:
 *   1. "offline-cache" — extract + verify SHA-256
 *   2. "<pkg>" — one npm install --offline for all outstanding packages
 *   3. "offline-cache" (cleanup) — rm .offline-cache on success
 *
 * On failure, the cache is PRESERVED (for debugging) and the error is
 * re-thrown so the wizard surfaces it. Registry fallback is not taken.
 */
async function runOfflineInstall(params: {
  resolution: Extract<ReturnType<typeof resolveOfflinePackages>, { present: true }>;
  outstanding: string[];
  pinMap: Map<string, string>;
  npmCmd: string;
  onProgress?: ProgressCallback;
}): Promise<void> {
  const { resolution, outstanding, pinMap, npmCmd, onProgress } = params;

  // Step 1: extract + verify
  onProgress?.({ step: "offline-cache", status: "running", output: "Preparing offline cache" });
  let cacacheDir: string;
  try {
    cacacheDir = await extractOfflineCache({
      tarballPath: resolution.tarballPath,
      expectedSha256: resolution.manifest.sha256,
      managedDir: MANAGED_DIR,
    });
  } catch (err: any) {
    onProgress?.({ step: "offline-cache", status: "error", error: err.message });
    throw err;
  }
  onProgress?.({ step: "offline-cache", status: "done", output: "Cache ready" });

  // Step 2: one `npm install --prefer-offline <p@v>...`
  const pkgsWithVersions = outstanding.map(name => ({
    name,
    version: pinMap.get(name)!,
  }));
  const humanLabel = pkgsWithVersions.map(p => p.name.split("/").pop()).join(", ");
  onProgress?.({ step: "offline-install", status: "running", output: `Installing ${humanLabel}` });

  // Map full package name ("@mariozechner/pi-coding-agent") to the UI step id
  // ("pi-coding-agent"). The wizard renders one row per UI step id.
  const uiStepIds = pkgsWithVersions.map((p) => p.name.split("/").pop()!);
  // Emit "running" for every UI row so the user sees activity for all three
  // packages while the single npm install proceeds.
  for (const id of uiStepIds) {
    onProgress?.({ step: id, status: "running", output: "Installing…" });
  }

  const args = buildOfflineInstallArgs({
    managedDir: MANAGED_DIR,
    cacheDir: path.dirname(cacacheDir), // parent of _cacache is what npm expects for --cache
    packages: pkgsWithVersions,
  });
  try {
    const [, ...restArgs] = args;
    await runNpmWithArgv(restArgs, npmCmd, (output) => {
      onProgress?.({ step: "offline-install", status: "running", output });
      // Best-effort: route lines mentioning a known package name to its UI row
      // so users see live npm output next to the right package.
      for (const id of uiStepIds) {
        if (output.includes(id)) {
          onProgress?.({ step: id, status: "running", output });
        }
      }
    });
  } catch (err: any) {
    onProgress?.({ step: "offline-install", status: "error", error: err.message });
    // Mark every UI row as errored so the user can see the failure.
    for (const id of uiStepIds) {
      onProgress?.({ step: id, status: "error", error: err.message });
    }
    throw err;
  }
  onProgress?.({ step: "offline-install", status: "done", output: `Installed ${humanLabel}` });
  for (const id of uiStepIds) {
    onProgress?.({ step: id, status: "done", output: "Installed" });
  }

  // Step 3: cleanup (reclaim ~140 MB)
  onProgress?.({ step: "offline-cache", status: "running", output: "Cleaning up" });
  try {
    rmSync(path.join(MANAGED_DIR, ".offline-cache"), { recursive: true, force: true });
    onProgress?.({ step: "offline-cache", status: "done", output: "Cleaned" });
  } catch (err: any) {
    // Non-fatal: install succeeded, cleanup failed. Just warn.
    onProgress?.({ step: "offline-cache", status: "done", output: `Cleanup warning: ${err.message}` });
  }
}

/** Internal: run npm with a full pre-built argv list (not `install <pkgs>`). */
function runNpmWithArgv(
  argv: string[],
  npmCmd: string,
  onOutput?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = buildInstallEnv();
    const parts = npmCmd.match(/"[^"]+"|\S+/g)?.map(s => s.replace(/^"|"$/g, "")) || [npmCmd];
    const cmd = parts[0];
    const args = [...parts.slice(1), "install", ...argv];
    const child = cpSpawn(cmd, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    });
    let stderr = "";
    const handleData = (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      const lines = text.split("\n").filter(l => l.trim());
      const last = lines[lines.length - 1];
      if (last && onOutput) onOutput(last.trim().substring(0, 120));
    };
    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);
    child.on("error", (err) => reject(new Error(err.message)));
    child.on("close", (code) => {
      if (code !== 0) {
        // Surface actual `npm error` / `npm ERR!` lines instead of the last 500 chars,
        // which are usually just the "complete log of this run can be found in: ..." footer.
        // See change: spawn-failure-diagnostics.
        const errLines = stderr
          .split(/\r?\n/)
          .filter((l) => /^npm (error|ERR!)/i.test(l) && !/A complete log of this run/i.test(l))
          .map((l) => l.replace(/^npm (error|ERR!)\s*/i, "").trim())
          .filter((l) => l.length > 0);
        const detail = errLines.length > 0
          ? errLines.join("\n").slice(0, 1500)
          : stderr.slice(-500) || `npm install exited with code ${code}`;
        reject(new Error(detail));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Power user mode: install the dashboard package globally.
 */
export async function installDashboardGlobal(onProgress?: ProgressCallback): Promise<void> {
  onProgress?.({ step: "pi-dashboard", status: "running" });
  try {
    await runNpmInstall(["@blackbelt-technology/pi-agent-dashboard"], process.cwd(), "npm install -g");
    onProgress?.({ step: "pi-dashboard", status: "done" });
  } catch (err: any) {
    onProgress?.({ step: "pi-dashboard", status: "error", error: err.message });
    throw err;
  }
}

// ── Recommended extensions installer ───────────────────────────

// Lazy-imported to keep the startup path light. Delegates to the shared
// ToolRegistry so we use the same ordered strategy chain (override ->
// bare-import -> managed -> npm-global) the server uses.
// See change: consolidate-tool-resolution.
async function loadPiPackageManager() {
  const { getDefaultRegistry } = await import(
    "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js"
  );
  const registry = getDefaultRegistry();
  const { module } = await registry.resolveModule<{
    DefaultPackageManager: any;
    SettingsManager: any;
  }>("pi-coding-agent");
  return module;
}

/**
 * Install a list of recommended extensions sequentially via pi's
 * DefaultPackageManager. Each entry is identified by its manifest `id`;
 * the source is resolved from `@blackbelt-technology/pi-dashboard-shared`'s
 * `RECOMMENDED_EXTENSIONS`. Stops on first failure and reports the error
 * through `onProgress` in the standard `InstallProgress` shape.
 *
 * @returns the number of entries successfully installed.
 */
export async function installRecommendedExtensions(
  ids: string[],
  onProgress?: ProgressCallback,
  skipPackages?: ReadonlySet<string>,
): Promise<number> {
  if (ids.length === 0) return 0;

  const { RECOMMENDED_EXTENSIONS } = await import(
    "@blackbelt-technology/pi-dashboard-shared/recommended-extensions.js"
  );

  const pm = await loadPiPackageManager();
  if (!pm?.DefaultPackageManager || !pm?.SettingsManager) {
    throw new Error(
      "pi-coding-agent is not installed. Install recommended extensions failed.",
    );
  }

  const agentDir = path.join(os.homedir(), ".pi", "agent");
  const cwd = os.homedir();
  const settingsManager = pm.SettingsManager.create(cwd, agentDir);
  const manager = new pm.DefaultPackageManager({ cwd, agentDir, settingsManager });

  // Pi's DefaultPackageManager shells out `npm install -g <pkg>` and inherits
  // the parent process's PATH — it doesn't accept an env override. In Electron,
  // process.env.PATH doesn't include the bundled/managed node bin dir, so the
  // spawned npm.cmd lookup fails on Windows. Temporarily prepend our augmented
  // PATH for the duration of the install loop, then restore. Idempotent: if PATH
  // already contains the dirs, no-op.
  // See change: spawn-failure-diagnostics.
  const originalPath = process.env.PATH;
  const installEnv = buildInstallEnv();
  if (installEnv.PATH && installEnv.PATH !== originalPath) {
    process.env.PATH = installEnv.PATH;
  }

  let installed = 0;
  try {
  for (const id of ids) {
    const entry = RECOMMENDED_EXTENSIONS.find((e: any) => e.id === id);
    if (!entry) {
      onProgress?.({
        step: id,
        status: "error",
        error: `Unknown recommended id: ${id}`,
      });
      throw new Error(`Unknown recommended id: ${id}`);
    }

    const step = entry.displayName;

    // Bundle activation from earlier step satisfies this id.
    if (skipPackages?.has(id)) {
      onProgress?.({ step, status: "done", output: "Already installed (bundled)" });
      installed++;
      continue;
    }

    onProgress?.({ step, status: "running" });
    try {
      // Workaround: pi's DefaultPackageManager shells out `git clone <url> <dest>`
      // without quoting the destination, breaking on Windows usernames with spaces
      // (e.g. "Róbert Csákány"). Pre-clone the repo ourselves with discrete argv
      // so `installAndPersist` sees an existing directory and skips its broken clone.
      // See change: spawn-failure-diagnostics (Windows-spaced-username workaround).
      await preClonePiExtensionIfGit(entry.source, agentDir);

      manager.setProgressCallback?.((event: any) => {
        if (event?.message) {
          onProgress?.({ step, status: "running", output: String(event.message).slice(0, 120) });
        }
      });
      await manager.installAndPersist(entry.source, { local: false });
      onProgress?.({ step, status: "done" });
      installed++;
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "install failed");
      onProgress?.({ step, status: "error", error: msg });
      throw err;
    }
  }
  } finally {
    // Restore the original PATH so we don't leak augmented env into the rest of
    // the Electron main process lifetime.
    if (originalPath !== undefined) {
      process.env.PATH = originalPath;
    } else {
      delete process.env.PATH;
    }
  }

  return installed;
}

/**
 * Pre-clone a recommended pi extension's git repo into pi's cache path so
 * the subsequent `manager.installAndPersist()` call sees an existing dir
 * and skips its own (improperly quoted) `git clone` command.
 *
 * Pi's package manager builds a shell command string `git clone <url> <dest>`
 * and runs it via the shell, which breaks when `<dest>` contains spaces
 * (e.g. `C:\Users\Róbert Csákány\.pi\agent\git\...`). Spawning git
 * with discrete argv avoids the shell entirely and quoting becomes moot.
 *
 * No-op for non-git sources (`npm:...`, etc.) and when the dir already exists.
 *
 * See change: spawn-failure-diagnostics.
 */
async function preClonePiExtensionIfGit(source: string, agentDir: string): Promise<void> {
  const parsed = parseBundledGitSource(source);
  if (!parsed) return; // npm: or unrecognized — leave it to pi's manager

  const destDir = path.join(agentDir, "git", parsed.host, parsed.path);
  if (existsSync(destDir)) return; // already cloned (or stub)

  // Strip any `@ref` suffix from the URL for the actual clone.
  // The version selection is pi's responsibility post-clone.
  let cloneUrl = source.trim().replace(/^git:/, "");
  const atIdx = cloneUrl.lastIndexOf("@");
  if (atIdx > cloneUrl.indexOf("://") + 3 && cloneUrl[atIdx - 1] !== ":") {
    // Only strip if it's a ref (not part of git@host).
    const candidate = cloneUrl.slice(0, atIdx);
    if (/\.git$/.test(candidate) || /github|gitlab|bitbucket/.test(candidate)) {
      cloneUrl = candidate;
    }
  }

  mkdirSync(path.dirname(destDir), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = cpSpawn("git", ["clone", cloneUrl, destDir], {
      stdio: ["ignore", "pipe", "pipe"],
      // Critically NOT shell:true — spawn passes argv discretely so
      // spaces in destDir don't get re-split by the shell.
    });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("error", (err: Error) => reject(new Error(`git spawn failed: ${err.message}`)));
    child.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone exited ${code}: ${stderr.trim().slice(-500)}`));
    });
  });
}

// ── Bundled extensions installer ───────────────────────────────

/**
 * Minimal git URL parser that mirrors the subset of pi's `parseGitUrl`
 * we need to compute pi's on-disk git cache path
 * (`<agentDir>/git/<host>/<user>/<repo>`) from the `source` declared in
 * `RECOMMENDED_EXTENSIONS`.
 *
 * Exported for unit testing. Accepts:
 *   - `https://github.com/user/repo.git`
 *   - `http://...`
 *   - `ssh://git@host/user/repo.git`
 *   - `git@host:user/repo.git`
 *   - `git:github:user/repo` (with explicit prefix; delegated to the
 *      minimal shorthand branch)
 *
 * Returns `null` if the URL isn't a recognizable git form.
 */
export function parseBundledGitSource(source: string): { host: string; path: string } | null {
  const trimmed = source.trim().replace(/^git:/, "");
  // SCP-like form: git@host:user/repo(.git)
  const scp = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?\/?$/);
  if (scp) {
    return { host: scp[1]!, path: stripRef(scp[2]!).replace(/\.git$/, "") };
  }
  // Explicit protocol URL.
  if (/^(https?|ssh|git):\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const rawPath = u.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
      const withoutGit = rawPath.replace(/\.git$/, "");
      const noRef = stripRef(withoutGit);
      if (!u.hostname || !noRef) return null;
      // host for ssh://git@github.com/... is just github.com (URL strips userinfo from hostname)
      return { host: u.hostname, path: noRef };
    } catch {
      return null;
    }
  }
  return null;
}

/** Strip a `@ref` suffix from a git path (e.g. `user/repo@branch` → `user/repo`). */
function stripRef(pathPart: string): string {
  const idx = pathPart.indexOf("@");
  return idx < 0 ? pathPart : pathPart.slice(0, idx);
}

/** Return the directory holding bundled extension source trees, or null in dev builds. */
function getBundledExtensionsDir(): string | null {
  const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) return null;
  const dir = path.join(resourcesPath, "bundled-extensions");
  return existsSync(dir) ? dir : null;
}

/**
 * Activate pre-bundled first-party pi extensions from the Electron
 * installer. Runs before `installRecommendedExtensions` so its return
 * value seeds that call's `skipPackages`.
 *
 * Strategy (per task 1 spike):
 *   1. For each id in `BUNDLED_EXTENSION_IDS` that has a matching
 *      subdirectory in `<resourcesPath>/bundled-extensions/` AND is in
 *      `RECOMMENDED_EXTENSIONS`:
 *      a. If `manager.getInstalledPath(source, "user")` already points
 *         to a real directory → skip (existing install wins), report
 *         `output: "Already installed"`.
 *      b. Otherwise copy the bundled tree into pi's git cache
 *         (`<agentDir>/git/<host>/<path>/`), run `npm install --omit=dev`
 *         if the package.json declares runtime `dependencies`, call
 *         `manager.addSourceToSettings(source, { local: false })`, and
 *         flush settings.
 *   2. Return the set of ids that were successfully activated (covers
 *      both "freshly copied" and "already installed" outcomes) so
 *      `installRecommendedExtensions` can skip them.
 *
 * A failure on one id is logged via `onProgress` but does NOT abort the
 * loop — other bundled ids and the subsequent dynamic install still run.
 */
export async function installBundledExtensions(
  onProgress?: ProgressCallback,
): Promise<string[]> {
  const bundledDir = getBundledExtensionsDir();
  if (!bundledDir) return [];

  const { BUNDLED_EXTENSION_IDS, RECOMMENDED_EXTENSIONS } = await import(
    "@blackbelt-technology/pi-dashboard-shared/recommended-extensions.js"
  );

  const presentOnDisk = new Set(
    readdirSync(bundledDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name),
  );

  const pm = await loadPiPackageManager();
  if (!pm?.DefaultPackageManager || !pm?.SettingsManager) {
    // Pi not installed yet — the earlier install step is responsible
    // for that. Bundled activation will be retried on next launch.
    return [];
  }

  const agentDir = path.join(os.homedir(), ".pi", "agent");
  const cwd = os.homedir();
  const settingsManager = pm.SettingsManager.create(cwd, agentDir);
  const manager = new pm.DefaultPackageManager({ cwd, agentDir, settingsManager });

  const activated: string[] = [];
  for (const id of BUNDLED_EXTENSION_IDS) {
    if (!presentOnDisk.has(id)) continue;
    const entry = RECOMMENDED_EXTENSIONS.find((e: any) => e.id === id);
    if (!entry) continue; // manifest drift; test should have caught this

    const step = entry.displayName;
    const bundledSrc = path.join(bundledDir, id);
    try {
      // Skip-if-present: existing user install (CLI or prior launch) wins.
      const existingPath = manager.getInstalledPath?.(entry.source, "user");
      if (existingPath && existsSync(existingPath)) {
        onProgress?.({ step, status: "done", output: "Already installed" });
        activated.push(id);
        continue;
      }

      // Compute pi's git cache path for this source.
      const parsed = parseBundledGitSource(entry.source);
      if (!parsed) {
        onProgress?.({
          step,
          status: "error",
          error: `Cannot parse git source: ${entry.source}`,
        });
        continue;
      }
      const targetDir = path.join(agentDir, "git", parsed.host, parsed.path);

      onProgress?.({ step, status: "running", output: "Copying bundled files…" });
      mkdirSync(path.dirname(targetDir), { recursive: true });
      cpSync(bundledSrc, targetDir, { recursive: true });

      // Run npm install --omit=dev only if runtime deps are declared.
      const pkgJsonPath = path.join(targetDir, "package.json");
      if (existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
          const hasDeps = pkg.dependencies && Object.keys(pkg.dependencies).length > 0;
          if (hasDeps) {
            onProgress?.({ step, status: "running", output: "Installing runtime dependencies…" });
            const npmCmd = resolveNpm();
            await runNpmInstall(["--omit=dev"], targetDir, npmCmd, (output) => {
              onProgress?.({ step, status: "running", output });
            });
          }
        } catch (err: any) {
          // Non-fatal: extension source is in place; pi may still load it.
          onProgress?.({
            step,
            status: "running",
            output: `npm install skipped: ${String(err?.message ?? err).slice(0, 80)}`,
          });
        }
      }

      // Persist the git URL in settings so pi's update() can later re-resolve.
      manager.addSourceToSettings(entry.source, { local: false });
      await settingsManager.flush?.();

      onProgress?.({ step, status: "done", output: "Bundled" });
      activated.push(id);
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? "bundled activation failed");
      onProgress?.({ step, status: "error", error: msg });
      // Continue with the rest — this id falls back to the dynamic install path.
    }
  }

  return activated;
}
