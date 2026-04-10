/**
 * Resolve the jiti register hook from pi's process context.
 *
 * The bridge extension runs inside pi's Node.js process. process.argv[1]
 * points to pi's CLI entry (e.g., pi-coding-agent/dist/cli.js). Since
 * jiti is a dependency of pi-coding-agent, createRequire(process.argv[1])
 * can resolve it directly.
 */

import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";

const JITI_PACKAGES = [
  "@mariozechner/jiti",
  "@oh-my-pi/jiti",
];

/**
 * Returns the absolute path to jiti's register hook (lib/jiti-register.mjs).
 * Uses process.argv[1] (pi's entry point) to anchor module resolution.
 */
export function resolveJitiImport(): string {
  const anchor = process.argv[1];
  if (anchor) {
    try {
      // Resolve symlinks — process.argv[1] may be a symlink (e.g., bin/pi → dist/cli.js)
      const resolved = realpathSync(anchor);
      const req = createRequire(resolved);
      for (const jiti of JITI_PACKAGES) {
        try {
          const pkgJson = req.resolve(`${jiti}/package.json`);
          return path.join(path.dirname(pkgJson), "lib", "jiti-register.mjs");
        } catch { /* next */ }
      }
    } catch { /* fall through */ }
  }

  throw new Error(
    "Cannot find pi's TypeScript loader (jiti). " +
    "Is @mariozechner/pi-coding-agent or @oh-my-pi/pi-coding-agent installed?"
  );
}
