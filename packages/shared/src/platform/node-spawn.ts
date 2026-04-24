/**
 * Canonical helper for spawning `node --import <loader> <entry>` argv.
 *
 * Node ≥ 20's ESM loader parses BOTH the `--import` loader position AND
 * the entry-script position as URLs. Raw Windows paths like
 * `B:\Dev\foo.ts` URL-parse to scheme `b:`, which is not in the ESM
 * loader's allowlist (file, data, node) → the process crashes with
 * `ERR_UNSUPPORTED_ESM_URL_SCHEME` before any filesystem access.
 *
 * Node's internal drive-letter heuristic catches the common cases
 * (`C:\`, `D:\`) but has known gaps for `A:`, `B:`, and other letters.
 * Rather than relying on the heuristic, we wrap every URL-parsed
 * position with `file://` unconditionally. `pathToFileURL` is a no-op
 * in effect on platforms that already worked.
 *
 * This module is the canonical chokepoint. The repo-level lint test
 * `no-raw-node-import.test.ts` refuses any other call site that
 * passes a raw path to `--import` / `--loader`.
 *
 * See change: fix-windows-entry-script-url.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SpawnOptions, ChildProcess } from "node:child_process"; // ban:child_process-ok — types only
import { spawn as execSpawn } from "./exec.js";

export interface SpawnNodeScriptOptions {
  /** Path to node.exe / node (raw OS path — binary, not ESM-loaded). */
  nodeBin?: string;

  /** Path to the script Node will run. Raw path OR file:// URL. */
  entry: string;

  /** Optional ESM loader for --import. Raw path OR file:// URL. */
  loader?: string;

  /** Arguments passed to the script (after entry). */
  args?: string[];

  /** Standard spawn options (cwd, env, stdio, detached, etc.). */
  spawnOptions?: SpawnOptions;
}

/**
 * Convert a path-or-url string to a file:// URL.
 *
 * Pure and idempotent. Safe to call on strings that are already
 * file:// URLs — returns them unchanged.
 *
 * Handles Windows-style input (drive letter + backslash) regardless of
 * host OS, so unit tests on Linux/macOS can exercise the Windows path
 * contract. Mirrors the pattern in
 * `packages/shared/src/resolve-jiti.ts::buildJitiRegisterUrl`.
 */
export function toFileUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("file:")) return pathOrUrl;

  const isWindowsStyle = /^[A-Za-z]:[\\/]/.test(pathOrUrl);
  if (isWindowsStyle) {
    // pathToFileURL on POSIX hosts URL-encodes backslashes rather than
    // treating them as separators. Build the URL manually so tests on
    // Linux produce the same result a Windows host would.
    return `file:///${pathOrUrl.replace(/\\/g, "/")}`;
  }

  // Use path.resolve to ensure absolute path on the host OS, then
  // let Node's pathToFileURL handle any host-specific quirks.
  const absolute = path.isAbsolute(pathOrUrl) ? pathOrUrl : path.resolve(pathOrUrl);
  return pathToFileURL(absolute).href;
}

/**
 * Spawn `node` with an optional `--import` loader and a script entry,
 * wrapping both positions in file:// URLs.
 *
 * Delegates actual spawning to `platform/exec.ts::spawn` so the
 * `windowsHide: true` default and other safe-spawn invariants are
 * preserved. Does not import `node:child_process` directly (the type
 * imports above are annotated with the opt-out marker).
 */
export function spawnNodeScript(opts: SpawnNodeScriptOptions): ChildProcess {
  const nodeBin = opts.nodeBin ?? process.execPath;

  const argv: string[] = [];
  if (opts.loader) {
    argv.push("--import", toFileUrl(opts.loader));
  }
  argv.push(toFileUrl(opts.entry));
  if (opts.args) argv.push(...opts.args);

  return execSpawn(nodeBin, argv, opts.spawnOptions ?? {});
}
