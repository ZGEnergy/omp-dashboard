/**
 * Re-materialize the `@blackbelt-technology/*` scope directory inside a
 * managed-install `node_modules/`.
 *
 * Background
 * ----------
 * `bundle-server.mjs` at build time materializes every workspace package
 * under `node_modules/@blackbelt-technology/` as a real copied directory,
 * so the shipped bundle is hermetic. On the user's machine the FIRST
 * extraction is fine — the materialized scope dir lands intact at
 * `~/.pi-dashboard/node_modules/@blackbelt-technology/`.
 *
 * BUT: subsequent `npm install` runs against the synthetic
 * `~/.pi-dashboard/package.json` (which only declares `pi`, `openspec`,
 * `tsx` as direct deps) WIPE that scope dir, because npm considers
 * `@blackbelt-technology/*` unreachable from the declared deps. The
 * server's own `<managed>/packages/` workspace sources survive (they
 * live under `<managed>/packages/<short>/`), but the scope dir is gone
 * and the client static-file resolution chain falls back to
 * "no client build found".
 *
 * Fix (Failure 1 of streamline-electron-bootstrap-and-recovery): after
 * every `installable.package` run, call
 * `materializeWorkspaceSymlinks(managedDir)`. The helper re-copies each
 * expected scope-dir entry from its workspace source under
 * `<managed>/packages/<short>/`. Idempotent — existing scope entries are
 * skipped unless `opts.force` is set.
 *
 * Single source of truth: `bundle-server.mjs` imports this helper so the
 * build-time and runtime materialization use identical logic.
 */
import path from "node:path";
import {
  existsSync,
  cpSync,
  rmSync,
  renameSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";

/**
 * Mapping: npm package name → workspace source shortname under
 * `<managedDir>/packages/<short>/`. Pinned to the bundle's actual
 * workspace layout (`bundle-server.mjs::BUNDLED_WORKSPACE_PKGS`).
 *
 * `pi-dashboard-web` is special: the bundle does NOT ship its source
 * (`packages/client/`); instead the *built* client lands at
 * `<managedDir>/packages/dist/client/`. The materializer reconstructs a
 * synthetic `<scope>/pi-dashboard-web/{package.json, dist/}` from that
 * built output.
 */
const SCOPE_ENTRY_SOURCES: ReadonlyArray<
  | { name: string; shortname: string; kind: "workspace" }
  | { name: string; kind: "built-client" }
> = [
  { name: "pi-dashboard-shared", shortname: "shared", kind: "workspace" },
  { name: "pi-dashboard-server", shortname: "server", kind: "workspace" },
  { name: "pi-dashboard-web", kind: "built-client" },
  { name: "pi-dashboard-extension", shortname: "extension", kind: "workspace" },
  { name: "dashboard-plugin-runtime", shortname: "dashboard-plugin-runtime", kind: "workspace" },
];

/** Expected scope-dir entries (npm names) — exported for callers/tests. */
export const BUNDLED_WORKSPACE_PKGS: readonly string[] = SCOPE_ENTRY_SOURCES.map(
  (e) => e.name,
);

export interface MaterializeResult {
  /** Packages newly materialized this run. */
  materialized: string[];
  /** Packages skipped because the scope-dir entry already existed (no force). */
  skipped: string[];
  /** Packages whose source could not be located under `<managedDir>/packages/`. */
  missingSource: string[];
  /** Errors keyed by package name. Failures NEVER throw; bootstrap must not break. */
  errors: Record<string, string>;
}

export interface MaterializeOpts {
  /** Force re-materialization even when a scope-dir entry already exists. Default: false. */
  force?: boolean;
}

/**
 * Re-populate `<managedDir>/node_modules/@blackbelt-technology/` from the
 * workspace sources inside `<managedDir>/packages/`. Idempotent.
 *
 * **Symlink-free / Windows-safe.** Despite the legacy name, this function
 * does NOT read, create, or follow symlinks. It performs plain directory
 * copies (`cpSync({recursive:true, dereference:true})`) from real source
 * dirs to real destination dirs. Safe on every platform we ship to,
 * including Windows where symlink creation requires admin / developer
 * mode. The name is preserved for parity with the bundle-time helper.
 *
 * Invariants:
 *   - Never throws. Returns a result object with per-entry status.
 *   - Skips entries that already exist as real directories (unless
 *     `opts.force` is true) so user-installed extensions in the scope
 *     dir survive.
 *   - When the source for an expected entry is absent, records it under
 *     `missingSource` and continues — partial materialization is fine.
 */
export function materializeWorkspaceSymlinks(
  managedDir: string,
  opts?: MaterializeOpts,
): MaterializeResult {
  const force = opts?.force ?? false;
  const result: MaterializeResult = {
    materialized: [],
    skipped: [],
    missingSource: [],
    errors: {},
  };

  const scopeDir = path.join(managedDir, "node_modules", "@blackbelt-technology");
  const packagesDir = path.join(managedDir, "packages");

  try {
    mkdirSync(scopeDir, { recursive: true });
  } catch (err) {
    result.errors["<mkdir-scope>"] =
      err instanceof Error ? err.message : String(err);
    return result;
  }

  for (const entry of SCOPE_ENTRY_SOURCES) {
    const dest = path.join(scopeDir, entry.name);

    // Skip when destination already exists and force is false.
    if (existsSync(dest) && !force) {
      // Honor existing dir/symlink — never blow it away accidentally.
      result.skipped.push(entry.name);
      continue;
    }

    try {
      if (entry.kind === "workspace") {
        const src = path.join(packagesDir, entry.shortname);
        if (!existsSync(src)) {
          result.missingSource.push(entry.name);
          continue;
        }
        atomicReplace(dest, () => {
          cpSync(src, dest, { recursive: true, dereference: true });
        });
        result.materialized.push(entry.name);
      } else {
        // built-client: reconstruct <scope>/pi-dashboard-web/{package.json,dist}.
        const distSrc = path.join(packagesDir, "dist", "client");
        if (!existsSync(path.join(distSrc, "index.html"))) {
          result.missingSource.push(entry.name);
          continue;
        }
        atomicReplace(dest, () => {
          mkdirSync(dest, { recursive: true });
          cpSync(distSrc, path.join(dest, "dist"), {
            recursive: true,
            dereference: true,
          });
          // Synthetic package.json — `name` must match for createRequire.resolve().
          const pkg = readWorkspacePackageJson(
            path.join(packagesDir, "client", "package.json"),
          ) ?? { name: entry.name, private: true };
          writeFileSync(
            path.join(dest, "package.json"),
            JSON.stringify(pkg, null, 2) + "\n",
          );
        });
        result.materialized.push(entry.name);
      }
    } catch (err) {
      result.errors[entry.name] =
        err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}

// ── helpers ────────────────────────────────────────────────────────────────

function atomicReplace(target: string, build: () => void): void {
  const tmp = target + ".materializing";
  rmSync(tmp, { recursive: true, force: true });
  try {
    // The `build` callback writes contents at `target` directly. We then
    // move target → tmp → rename back, but the simpler pattern is: build
    // at tmp, then swap. Caller writes directly to `target`; we wrap with
    // a swap to make failures non-corrupting.
    // Re-route by passing tmp into the build via a small trick: rename
    // target out (if present), build at target, on success drop the
    // backup.
    let backup: string | null = null;
    if (existsSync(target)) {
      backup = target + ".backup";
      rmSync(backup, { recursive: true, force: true });
      renameSync(target, backup);
    }
    try {
      build();
      if (backup) rmSync(backup, { recursive: true, force: true });
    } catch (err) {
      // Restore backup on failure.
      try {
        rmSync(target, { recursive: true, force: true });
      } catch { /* ignore */ }
      if (backup && existsSync(backup)) {
        try { renameSync(backup, target); } catch { /* ignore */ }
      }
      throw err;
    }
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function readWorkspacePackageJson(pkgJsonPath: string): { name?: string } | null {
  try {
    if (!existsSync(pkgJsonPath)) return null;
    const obj = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    if (obj && typeof obj === "object") {
      // Strip dev-only fields; keep just what a consumer needs to resolve.
      return {
        name: obj.name,
        version: obj.version,
        main: obj.main,
        module: obj.module,
        type: obj.type,
        exports: obj.exports,
      };
    }
  } catch { /* ignore */ }
  return null;
}
