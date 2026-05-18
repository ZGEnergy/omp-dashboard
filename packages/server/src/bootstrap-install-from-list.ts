/**
 * Bootstrap install reconciler driven by ~/.pi/dashboard/installable.json.
 * Invoked by cli.ts before app.listen.
 *
 * File-absent path is a deliberate no-op: Bridge and Standalone starters
 * never write installable.json; only Electron seeds it on first run.
 * When the file is absent, this function logs and returns immediately so
 * bootstrap.status transitions to "ready" without delay.
 *
 * See change: simplify-electron-bootstrap-derived-state.
 */
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { isPackageInstalledOnDisk } from "@blackbelt-technology/pi-dashboard-shared/managed-package-detect.js";
import { getManagedDir } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";
import { materializeWorkspaceSymlinks } from "@blackbelt-technology/pi-dashboard-shared/managed-workspace-materialize.js";
import {
  readInstallableList,
  type InstallablePackage,
} from "@blackbelt-technology/pi-dashboard-shared/installable-list.js";
import { bootstrapInstall } from "@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js";
import { getDefaultRegistry } from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";
import type { BootstrapStateStore } from "./bootstrap-state.js";

// ── Injectable helpers (overridable in tests) ──────────────────────────────

export type InstallProgressCallback = (line: string) => void;
export type PackageInstaller = (
  pkg: InstallablePackage,
  onOutput: InstallProgressCallback,
) => Promise<void>;

// ── Installed-check ────────────────────────────────────────────────────────

/**
 * Return true if `pkgName` is resolvable from `managedDir/node_modules`.
 * Version satisfies check is intentionally omitted (no semver dep) —
 * we treat "resolves at all" as satisfied. This is sufficient for the
 * Phase B bootstrap use case.
 */
/**
 * Returns true when the package's `package.json` is present under
 * `<managedDir>/node_modules/<name>/`. Delegates to the shared
 * `isPackageInstalledOnDisk` helper, which uses `fs.existsSync` rather
 * than `require.resolve` to avoid the `exports`-map trap that made the
 * bootstrap fast-path always-miss for packages with restrictive
 * exports (notably `@earendil-works/pi-coding-agent` +
 * `@fission-ai/openspec`).
 *
 * See change: fix-is-npm-package-installed-exports-map.
 */
export function isNpmPackageInstalled(
  pkgName: string,
  managedDir: string,
  expectedVersion?: string,
): boolean {
  return isPackageInstalledOnDisk(pkgName, managedDir, expectedVersion);
}

/**
 * Return true if any entry in pi's `settings.json#packages[]` references
 * `pkgName` — regardless of source form (npm/git/local).
 *
 * Used to dedupe reconciler installs against bundled-extensions activation
 * (`installBundledExtensions` writes a `git:` entry; the reconciler would
 * otherwise add a redundant `npm:` entry on every launch).
 *
 * Heuristic match:
 *   - `npm:@scope/name` / `npm:@scope/name@ver`   → exact name extract
 *   - `git:host/Org/<repo>` / `git:.../repo#ref`  → repo basename equals
 *     unscoped name (matches the dashboard's bundled-extensions naming
 *     convention: `pi-anthropic-messages` repo ↔ `@blackbelt-technology/pi-anthropic-messages` pkg)
 *   - `<absolute-path>` (local)                   → not name-matchable, skipped
 *
 * See change: streamline-electron-bootstrap-and-recovery group 15.
 */
export function isPackageRegisteredInPiSettings(
  pkgName: string,
  agentDir: string = path.join(os.homedir(), ".pi", "agent"),
): boolean {
  try {
    const settingsPath = path.join(agentDir, "settings.json");
    const fs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(settingsPath)) return false;
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as { packages?: string[] };
    const packages = settings.packages ?? [];
    // Unscoped basename for git-URL matching.
    const slash = pkgName.lastIndexOf("/");
    const basename = slash >= 0 ? pkgName.slice(slash + 1) : pkgName;
    for (const entry of packages) {
      if (typeof entry !== "string") continue;
      if (entry.startsWith("npm:")) {
        // npm:@scope/name(@version)  or  npm:bare-name(@version)
        const afterPrefix = entry.slice("npm:".length);
        // Strip @version suffix — but keep leading @ of scoped names.
        const atIdx = afterPrefix.lastIndexOf("@");
        const name = atIdx > 0 ? afterPrefix.slice(0, atIdx) : afterPrefix;
        if (name === pkgName) return true;
      } else if (entry.startsWith("git:") || entry.startsWith("http") || entry.includes(".git")) {
        // git:host/org/repo  or  git+https://... — match by repo basename.
        // Strip trailing #ref, .git suffix.
        const noRef = entry.split("#")[0]!;
        const noGit = noRef.endsWith(".git") ? noRef.slice(0, -4) : noRef;
        const repoSlash = noGit.lastIndexOf("/");
        const repo = repoSlash >= 0 ? noGit.slice(repoSlash + 1) : noGit;
        if (repo === basename) return true;
      }
      // Local-path entries cannot be matched by name; skip.
    }
    return false;
  } catch {
    return false;
  }
}

// ── Default installers ─────────────────────────────────────────────────────

async function defaultNpmInstall(
  pkg: InstallablePackage,
  managedDir: string,
  onOutput: InstallProgressCallback,
): Promise<void> {
  const spec =
    pkg.version && pkg.version !== "*"
      ? `${pkg.name}@${pkg.version}`
      : pkg.name;
  const res = await bootstrapInstall({
    packages: [spec],
    managedDir,
    progress: (p) => {
      if (p.output) onOutput(p.output);
    },
  });
  if (!res.ok) {
    throw new Error(res.error);
  }
}

async function defaultPiExtensionInstall(
  pkg: InstallablePackage,
  onOutput: InstallProgressCallback,
): Promise<void> {
  const registry = getDefaultRegistry();
  const { module: piModule } = await registry.resolveModule<{
    DefaultPackageManager: any;
    SettingsManager: any;
  }>("pi-coding-agent");
  const agentDir = path.join(os.homedir(), ".pi", "agent");
  const settingsManager = piModule.SettingsManager.create(process.cwd(), agentDir);
  const pm = new piModule.DefaultPackageManager({
    cwd: process.cwd(),
    agentDir,
    settingsManager,
  });
  pm.setProgressCallback((event: { message?: string }) => {
    if (event.message) onOutput(event.message);
  });
  await pm.installAndPersist(buildPiInstallSpec(pkg), { local: false });
}

/**
 * Build the source spec passed to pi's `DefaultPackageManager.installAndPersist`.
 *
 * Pi's `parseSource()` (in `@earendil-works/pi-coding-agent`) falls through
 * to `type: "local"` for any string that is not prefixed with `npm:` and not
 * recognized as a git URL. A bare scoped name like
 * `@blackbelt-technology/pi-anthropic-messages` becomes a relative-path lookup
 * against `cwd`, producing the misleading error
 * `Path does not exist: <cwd>/@blackbelt-technology/pi-anthropic-messages`.
 *
 * Prefix with `npm:` so pi resolves from the npm registry. When `pkg.version`
 * is present, pin via `npm:<name>@<version>` so installable.json's recorded
 * version is honored.
 *
 * Exported for unit testing.
 */
export function buildPiInstallSpec(pkg: InstallablePackage): string {
  return pkg.version ? `npm:${pkg.name}@${pkg.version}` : `npm:${pkg.name}`;
}

// ── Options ────────────────────────────────────────────────────────────────

export interface BootstrapInstallFromListOptions {
  /** Override config dir for installable.json (default: ~/.pi/dashboard/). */
  configDir?: string;
  /** Override managed dir for npm installs (default: ~/.pi-dashboard/). */
  managedDir?: string;
  /**
   * Injectable npm installer. Defaults to bootstrapInstall.
   * Receives the InstallablePackage and a streaming output callback.
   */
  npmInstall?: PackageInstaller;
  /**
   * Injectable pi-extension installer. Defaults to pi DefaultPackageManager.
   * Receives the InstallablePackage and a streaming output callback.
   */
  piInstall?: PackageInstaller;
  /**
   * Injectable installed-check for npm packages.
   * Defaults to isNpmPackageInstalled.
   */
  isInstalled?: (pkg: InstallablePackage, managedDir: string) => boolean;
}

// ── Main reconciler ────────────────────────────────────────────────────────

/**
 * Reconcile packages from installable.json against the managed directory.
 *
 * - File absent: log and return immediately (not a failure).
 * - Per package: check installed → skip or install.
 * - Required failure: set bootstrap status=failed, throw (abort server start).
 * - Optional failure: log, record in failed[], continue.
 */
export async function bootstrapInstallFromList(
  bootstrapState: BootstrapStateStore,
  opts?: BootstrapInstallFromListOptions,
): Promise<void> {
  const configDir =
    opts?.configDir ?? path.join(os.homedir(), ".pi", "dashboard");
  const managedDir = opts?.managedDir ?? getManagedDir();

  // Read installable.json; absent file is a deliberate no-op.
  const list = await readInstallableList(configDir);
  if (list === null) {
    console.log(
      "[bootstrap] bootstrap.installable.skipped reason=file-not-found",
    );
    return;
  }

  // Only process packages that are active (not deprecated, not defaultOff).
  const packages = list.packages.filter((p) => !p.deprecated && !p.defaultOff);
  const total = packages.length;
  let installedCount = 0;
  const failed: string[] = [];

  // Stamp initial installable progress into bootstrap state.
  bootstrapState.set({ installable: { total, installed: 0, failed: [] } });

  // Default fast-path detector: presence + (when pinned) version match.
  // Passing `pkg.version` so a version bump in installable.json correctly
  // triggers a reinstall, while no-op launches stay free.
  const checkInstalled =
    opts?.isInstalled ?? ((p, dir) => isNpmPackageInstalled(p.name, dir, p.version));
  const doNpmInstall: PackageInstaller =
    opts?.npmInstall ??
    ((p, cb) => defaultNpmInstall(p, managedDir, cb));
  const doPiInstall: PackageInstaller =
    opts?.piInstall ?? defaultPiExtensionInstall;

  for (const pkg of packages) {
    // Source label for progress + log lines (v2 schema). Falls back to
    // kind-based inference when absent (v1 file pre-migration).
    const sourceLabel = pkg.source ?? (pkg.kind === "pi-extension" ? "bundled-git" : "npm-registry");

    // Fast path: already installed.
    //   - npm packages: resolve from managedDir/node_modules.
    //   - pi-extensions: check pi's settings.json#packages[] for ANY form
    //     (npm:/git:/local) referring to this package name. Prevents the
    //     reconciler from adding a duplicate npm: entry on every launch
    //     when installBundledExtensions already registered a git: entry.
    //     See change: streamline-electron-bootstrap-and-recovery group 15.
    const alreadyInstalled =
      pkg.kind === "npm"
        ? checkInstalled(pkg, managedDir)
        : isPackageRegisteredInPiSettings(pkg.name);
    if (alreadyInstalled) {
      console.log(
        `[bootstrap] bootstrap.installable.package name=${pkg.name} source=${sourceLabel} status=satisfied`,
      );
      installedCount++;
      bootstrapState.set({
        installable: { total, installed: installedCount, failed },
      });
      continue;
    }

    // Emit installing progress with source prefix.
    bootstrapState.set({
      progress: { step: pkg.name, output: `[${sourceLabel}] installing...` },
      installable: { total, installed: installedCount, failed },
    });

    try {
      const onOutput = (line: string): void => {
        bootstrapState.set({ progress: { step: pkg.name, output: line } });
      };

      if (pkg.kind === "npm") {
        await doNpmInstall(pkg, onOutput);
      } else {
        await doPiInstall(pkg, onOutput);
      }

      installedCount++;
      bootstrapState.set({
        progress: undefined,
        installable: { total, installed: installedCount, failed },
      });
      console.log(
        `[bootstrap] bootstrap.installable.package name=${pkg.name} source=${sourceLabel} status=done`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[bootstrap] bootstrap.installable.package name=${pkg.name} source=${sourceLabel} status=error error=${message}`,
      );
      failed.push(pkg.name);
      bootstrapState.set({
        progress: undefined,
        installable: { total, installed: installedCount, failed: [...failed] },
      });

      if (pkg.required) {
        const errorMessage = `Required package "${pkg.name}" failed to install: ${message}`;
        bootstrapState.set({
          status: "failed",
          error: { message: errorMessage },
        });
        throw new Error(errorMessage);
      }
      // Optional package failure: log, continue to next package.
    }
  }

  // Final state snapshot.
  bootstrapState.set({
    installable: { total, installed: installedCount, failed },
  });
  console.log(
    `[bootstrap] bootstrap.installable.done total=${total} installed=${installedCount} failed=${failed.length}`,
  );

  // Re-materialize the @blackbelt-technology scope dir. `npm install`
  // invocations during the installable run can wipe scope-dir entries
  // because they're unreachable from the synthetic managed-dir
  // package.json deps. Idempotent + best-effort: a materialization
  // failure must NOT fail bootstrap (worst case: client UI 404s, server
  // still works for API consumers).
  // See change: streamline-electron-bootstrap-and-recovery (Failure 1).
  try {
    const mat = materializeWorkspaceSymlinks(managedDir);
    const matTotal = mat.materialized.length + mat.skipped.length + mat.missingSource.length;
    if (matTotal > 0) {
      console.log(
        `[bootstrap] bootstrap.materialize.done materialized=${mat.materialized.length} skipped=${mat.skipped.length} missingSource=${mat.missingSource.length} errors=${Object.keys(mat.errors).length}`,
      );
    }
    for (const [name, msg] of Object.entries(mat.errors)) {
      console.warn(
        `[bootstrap] bootstrap.materialize.error name=${name} error=${msg}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[bootstrap] bootstrap.materialize.unhandled error=${msg}`);
  }
}
