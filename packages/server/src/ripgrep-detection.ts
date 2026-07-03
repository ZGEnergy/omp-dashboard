/**
 * One-time detection of the `ripgrep` (`rg`) binary, mirroring the editor
 * binary detection idiom. `/api/grep` prefers `rg` (honours `.gitignore`, fast,
 * native regexp) and falls back to a bounded in-process scan when it is absent.
 *
 * See change: split-editor-workspace.
 */

import { ToolResolver } from "@blackbelt-technology/pi-dashboard-shared/platform/binary-lookup.js";

const resolver = new ToolResolver({ processExecPath: process.execPath });

let cached: string | null | undefined;

/**
 * Absolute path to `rg`, or `null` when not on PATH. Cached after first call.
 * `whichFn` is injectable for tests.
 */
export function detectRipgrep(whichFn: (name: string) => string | null = (n) => resolver.which(n)): string | null {
  if (cached !== undefined) return cached;
  cached = whichFn("rg");
  return cached;
}

/** Clear the detection cache (tests). */
export function resetRipgrepCache(): void {
  cached = undefined;
}
