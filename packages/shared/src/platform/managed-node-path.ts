/**
 * Prepend the managed Node runtime directory to a child-process `PATH`.
 *
 * The managed Node lives at `<managedDir>/node/` (Windows: binaries at
 * the root; Unix: binaries under `bin/`). When present, every spawn the
 * dashboard controls SHALL inherit that directory at the front of its
 * `PATH` so plain `node` / `npm` invocations inside the child process
 * resolve to the managed runtime.
 *
 * Pure helper: never mutates `process.env`, returns a distinct cloned
 * env object, no-ops when the managed runtime is absent.
 *
 * See change: embed-managed-node-runtime (spec: managed-node-runtime,
 * Requirement: Spawned children inherit managed Node on PATH).
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { getManagedDir, type ManagedPathsEnv } from "../managed-paths.js";

/**
 * Resolve the bin directory inside the managed Node tree.
 *   Windows: `<managedDir>/node`        (node.exe + npm.cmd live at root)
 *   Unix:    `<managedDir>/node/bin`    (node, npm, npx live under bin/)
 *
 * `platform` defaults to `process.platform`; tests inject `"win32"` from
 * a Linux host to exercise the Windows layout.
 */
export function getManagedNodeBinDir(
  env?: ManagedPathsEnv,
  platform: NodeJS.Platform = process.platform,
): string {
  const root = path.join(getManagedDir(env), "node");
  return platform === "win32" ? root : path.join(root, "bin");
}

/** Path to the managed `node` / `node.exe` binary. */
export function getManagedNodeBinary(
  env?: ManagedPathsEnv,
  platform: NodeJS.Platform = process.platform,
): string {
  const bin = getManagedNodeBinDir(env, platform);
  return path.join(bin, platform === "win32" ? "node.exe" : "node");
}

/** True iff the managed Node runtime is installed (binary exists). */
export function isManagedNodePresent(
  env?: ManagedPathsEnv,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return existsSync(getManagedNodeBinary(env, platform));
}

/**
 * Return a shallow-cloned env with the managed Node bin directory
 * prepended to `PATH`. No-op (still returns a clone) when the managed
 * runtime is not installed or its directory is already on PATH.
 *
 * Never mutates the input env or `process.env`.
 */
export function prependManagedNodeToPath(
  baseEnv: NodeJS.ProcessEnv = process.env,
  managedPathsEnv?: ManagedPathsEnv,
): NodeJS.ProcessEnv {
  const cloned: NodeJS.ProcessEnv = { ...baseEnv };
  if (!isManagedNodePresent(managedPathsEnv)) return cloned;

  const dir = getManagedNodeBinDir(managedPathsEnv);
  const currentPath = cloned.PATH ?? "";
  // Avoid duplicate prepends when the dir is already at the head; cheap
  // string contains check matches `buildSpawnEnv` style.
  if (currentPath.split(path.delimiter).includes(dir)) return cloned;

  cloned.PATH = currentPath
    ? `${dir}${path.delimiter}${currentPath}`
    : dir;
  return cloned;
}
