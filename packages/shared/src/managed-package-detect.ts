/**
 * managed-package-detect.ts — single source of truth for "is this npm
 * package installed in the managed dir?" checks.
 *
 * Bug being fixed (see change: fix-is-npm-package-installed-exports-map):
 *
 * Earlier consumers used:
 *   createRequire(<managedDir>/package.json).resolve(name + "/package.json")
 *
 * Node's `exports` map enforcement (always-on in Node 14+, strict in
 * recent Node 24 builds) makes that pattern fail for any package whose
 * `exports` map does NOT include `"./package.json"`. Both
 * `@earendil-works/pi-coding-agent` and `@fission-ai/openspec` have
 * restrictive exports maps (`.` + a handful of named subpaths, no
 * `./package.json`, no wildcard). `require.resolve` throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` and the caller incorrectly concludes
 * the package is missing.
 *
 * Knock-on effect: the dashboard's bootstrap fast-path never fires, so
 * `npm install <pkg>@<ver>` runs on every launch, which prunes
 * `node_modules/` of every package NOT in the synthetic
 * `package.json`'s declared deps — including the dashboard server's
 * own transitive deps (`readable-stream`, `fastify`, `pino`, etc.).
 * Every endpoint that lazy-loads a pruned module 500s. Settings panel
 * shows "Failed to load settings" because `/api/config` returns
 * `MODULE_NOT_FOUND`.
 *
 * Fix: filesystem check. The npm install layout is fully deterministic
 * — `<managedDir>/node_modules/<name>/package.json` is the canonical
 * location. `fs.existsSync` bypasses the exports map entirely.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Returns true when `<managedDir>/node_modules/<name>/package.json`
 * exists on disk. When `expectedVersion` is provided and is not `"*"`,
 * also requires the file's `version` field to match.
 *
 * Returns false on:
 * - missing file
 * - corrupt JSON
 * - version mismatch (when `expectedVersion` provided and not `"*"`)
 *
 * Pure I/O. Does NOT use module resolution. Does NOT traverse `exports`
 * maps. Cost: 1 stat + (optionally) 1 read of a small file.
 */
export function isPackageInstalledOnDisk(
  name: string,
  managedDir: string,
  expectedVersion?: string,
): boolean {
  const pkgJsonPath = path.join(
    managedDir,
    "node_modules",
    ...name.split("/"),
    "package.json",
  );
  if (!fs.existsSync(pkgJsonPath)) return false;

  // Always parse the file so corrupt JSON is treated as "needs reinstall".
  // The cost (~10 μs per call) is negligible vs. the failure mode of
  // reporting a broken install as healthy.
  let parsed: { version?: string };
  try {
    parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as { version?: string };
  } catch {
    return false;
  }

  // Presence + valid JSON. No version pin or wildcard → satisfied.
  if (!expectedVersion || expectedVersion === "*") return true;

  // Version-pinned: must match.
  return parsed.version === expectedVersion;
}
