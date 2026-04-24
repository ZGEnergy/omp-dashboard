/**
 * Repo-level invariant: any source file that passes an argv to Node
 * with `--import` or `--loader` MUST wrap the following positions
 * (loader and entry script) in `file://` URLs via `toFileUrl(...)` or
 * `pathToFileURL(...).href`. Raw OS paths on Windows drives whose
 * letter collides with URL-scheme parsing (e.g. `B:\`) crash Node with
 * `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
 *
 * If this test fails, migrate the offending file to use
 * `spawnNodeScript` or wrap the entry/loader with `toFileUrl` from
 * `@blackbelt-technology/pi-dashboard-shared/platform/node-spawn.js`.
 *
 * See change: fix-windows-entry-script-url.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

/** Files allowed to reference --import / --loader with raw identifiers. */
const ALLOWLIST: readonly string[] = [
  "packages/shared/src/platform/node-spawn.ts",
  // resolve-jiti.ts returns a file:// URL to callers; it does not itself
  // build a `["--import", X, Y]` argv. Allowlisted as the documented
  // source of loader URLs referenced in server spawn call sites.
  "packages/shared/src/resolve-jiti.ts",
];

/** Per-line opt-out for intentional usages (e.g. comment examples). */
const OPT_OUT_MARKER = "ban:raw-node-import-ok";

/**
 * Detect argv arrays containing `"--import"` or `"--loader"` followed by
 * a bare identifier (not a string literal and not a wrapped call).
 *
 * We match the argv-literal shape:
 *   ["--import", X, Y]
 *   args: ["--import", X, Y, ...]
 *
 * Then check that both X and Y are either:
 *   - a string literal starting with "file:" (already a URL)
 *   - a call expression to toFileUrl(...) or pathToFileURL(...).href
 *   - the identifier resolveJitiImport() / resolveJitiFromAnchor() (which
 *     are documented to return file:// URLs — allowlisted by name)
 *
 * Anything else is flagged.
 */
const IMPORT_ARGV_RE =
  /["']--(?:import|loader)["']\s*,\s*([^,\]]+?)\s*,\s*([^,\]]+?)(?:\s*,|\s*\])/g;

const URL_LOOKING_RE =
  /^(?:["']file:|toFileUrl\s*\(|pathToFileURL\s*\([^)]*\)\s*\.href|resolveJitiImport\s*\(|resolveJitiFromAnchor\s*\()/;

/** Recursively walk a directory, yielding .ts / .tsx files. */
async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "__tests__") continue;
      yield* walk(full);
    } else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name)) {
      yield full;
    }
  }
}

describe("no raw paths passed to node --import / --loader", () => {
  it("only URL-wrapped or allowlisted argv positions follow --import / --loader", async () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "..", "..", "..", "..");
    const packagesDir = path.resolve(repoRoot, "packages");

    const allowSet = new Set(
      ALLOWLIST.map((p) => path.resolve(repoRoot, p).replace(/\\/g, "/")),
    );

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
        const normalized = file.replace(/\\/g, "/");
        if (allowSet.has(normalized)) continue;

        const content = await fs.readFile(file, "utf-8");
        const lines = content.split(/\r?\n/);

        // Walk each line and check for the argv pattern. Track byte
        // offsets so we can compute line numbers for multi-line matches.
        let offset = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          // Fast path: only inspect lines that mention --import or --loader.
          if (!line.includes("--import") && !line.includes("--loader")) {
            offset += line.length + 1;
            continue;
          }
          if (line.includes(OPT_OUT_MARKER)) {
            offset += line.length + 1;
            continue;
          }
          // Check the current line alone (we allow argv to be on one line;
          // multi-line argv arrays are a rare style and would still trip
          // the quick search above).
          IMPORT_ARGV_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = IMPORT_ARGV_RE.exec(line)) !== null) {
            const loaderArg = m[1]!.trim();
            const entryArg = m[2]!.trim();
            const loaderOk = URL_LOOKING_RE.test(loaderArg);
            const entryOk = URL_LOOKING_RE.test(entryArg);
            if (!loaderOk || !entryOk) {
              violations.push({
                file: path.relative(repoRoot, file),
                line: i + 1,
                text: line.trim(),
              });
            }
          }
          offset += line.length + 1;
        }
      }
    }

    if (violations.length > 0) {
      const msg =
        `Raw filesystem paths passed to node --import / --loader found.\n` +
        `Migrate each call site to use spawnNodeScript() or wrap the\n` +
        `loader/entry with toFileUrl(...) from:\n` +
        `  import { toFileUrl, spawnNodeScript } from\n` +
        `    "@blackbelt-technology/pi-dashboard-shared/platform/node-spawn.js";\n\n` +
        `Offenders (${violations.length}):\n` +
        violations
          .map((v) => `  ${v.file}:${v.line}  ${v.text}`)
          .join("\n");
      expect(violations, msg).toEqual([]);
    }
  });
});
