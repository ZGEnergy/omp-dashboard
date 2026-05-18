/**
 * Repo-level invariant: `require.resolve(<name> + "/package.json")` MUST
 * NOT be used as a presence check for a managed npm package.
 *
 * Background: modern Node enforces the `exports` map. Packages with
 * restrictive exports (no `./package.json` entry) cause
 * `require.resolve(name + "/package.json")` to throw
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` even when the file is fully present
 * on disk. Callers that interpret that throw as "not installed" run
 * stale install paths every launch.
 *
 * Use `isPackageInstalledOnDisk` from
 * `@blackbelt-technology/pi-dashboard-shared/managed-package-detect.js`
 * instead. It does an `fs.existsSync` on the canonical path and
 * bypasses the exports map.
 *
 * Per-line opt-out: append `// require-resolve-pkgjson-ok: <reason>`
 * to the offending line if the call is intentional and the
 * exports-map exemption is acceptable.
 *
 * See change: fix-is-npm-package-installed-exports-map.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

/** Catches `X.resolve(Y + "/package.json")` for any X (require, req,
 *  createRequire(...), this.someResolve, etc.) and any string concatenation. */
const FORBIDDEN_RE =
  /\.resolve\s*\(\s*[^)]+\+\s*["']\/package\.json["']\s*[,)]/;

const OPT_OUT_MARKER = "require-resolve-pkgjson-ok";

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "__tests__"
      )
        continue;
      yield* walk(full);
    } else if (entry.isFile() && /\.(ts|tsx|mts|cts|mjs|js)$/.test(entry.name)) {
      yield full;
    }
  }
}

describe("no require.resolve(...+\"/package.json\") presence checks", () => {
  it("only allowlisted paths call require.resolve(name + '/package.json')", async () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "..", "..", "..", "..");
    const packagesDir = path.resolve(repoRoot, "packages");

    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const pkg of await fs.readdir(packagesDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const srcDir = path.join(packagesDir, pkg.name, "src");
      try {
        await fs.access(srcDir);
      } catch {
        continue;
      }
      for await (const file of walk(srcDir)) {
        const content = await fs.readFile(file, "utf-8");
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (!FORBIDDEN_RE.test(line)) return;
          if (line.includes(OPT_OUT_MARKER)) return;
          // Skip comment lines (single-line `//` and JSDoc `*` body lines).
          // The lint catches CALLS, not documentation of the forbidden pattern.
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          violations.push({
            file: path.relative(repoRoot, file),
            line: idx + 1,
            text: trimmed,
          });
        });
      }
    }

    if (violations.length > 0) {
      const msg =
        `Forbidden pattern: require.resolve(name + "/package.json").\n` +
        `Use isPackageInstalledOnDisk from\n` +
        `  @blackbelt-technology/pi-dashboard-shared/managed-package-detect.js\n` +
        `for presence checks. See openspec/changes/fix-is-npm-package-installed-exports-map/.\n\n` +
        `Offenders (${violations.length}):\n` +
        violations
          .map((v) => `  ${v.file}:${v.line}  ${v.text}`)
          .join("\n");
      expect(violations, msg).toEqual([]);
    }
  });
});
