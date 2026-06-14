/**
 * Repo-level invariant: bundled-git paths (`resources/git/...`,
 * `cmd/git.exe`, `usr/bin/sh.exe`, the arch libdirs) MUST only appear in
 * the platform resolver helpers + build scripts. Every other module MUST
 * go through `resolveBundledGitDir()` / `ensureBundledGitOnPath()` so the
 * layout lives in exactly one place (mirrors
 * no-hardcoded-node-modules-paths.test.ts).
 *
 * If this fails, replace the hardcoded path with a call into
 * `packages/shared/src/platform/ensure-bundled-git.ts`.
 *
 * See change: embed-git-bash-on-windows.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const PATTERNS: readonly { re: RegExp; hint: string }[] = [
  { re: /resources[\\/]git[\\/]/, hint: "hardcoded resources/git path" },
  { re: /cmd[\\/]git\.exe/, hint: "hardcoded git launcher path" },
  { re: /usr[\\/]bin[\\/](sh|bash)\.exe/, hint: "hardcoded shell path" },
];

/** Files allowed to reference bundled-git paths (the resolver + build). */
const ALLOWLIST: readonly string[] = [
  "packages/shared/src/platform/ensure-bundled-git.ts",
  "packages/shared/src/platform/git-source.ts",
  "packages/shared/src/__tests__/no-hardcoded-bundled-git-paths.test.ts",
  "packages/shared/src/__tests__/ensure-bundled-git.test.ts",
  "packages/electron/scripts/download-git-windows.mjs",
  "packages/electron/scripts/bundle-server.mjs",
  "packages/electron/scripts/assert-runnable-bundle.mjs",
  "packages/electron/src/lib/app-menu.ts",
];

/** Roots scanned for source that must NOT hardcode bundled-git paths. */
const SCAN_ROOTS: readonly string[] = [
  "packages/shared/src",
  "packages/server/src",
  "packages/client/src",
  "packages/electron/src",
];

const EXTS = new Set([".ts", ".tsx", ".mjs", ".js"]);

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(e.name))) out.push(full);
  }
}

describe("no hardcoded bundled-git paths outside resolver helpers", () => {
  it("only allowlisted files reference resources/git or git.exe/sh.exe paths", () => {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "..", "..", "..", "..");
    const allow = new Set(ALLOWLIST.map((p) => path.resolve(repoRoot, p).replace(/\\/g, "/")));

    const files: string[] = [];
    for (const root of SCAN_ROOTS) walk(path.resolve(repoRoot, root), files);

    const violations: string[] = [];
    for (const file of files) {
      if (allow.has(file.replace(/\\/g, "/"))) continue;
      const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/);
      lines.forEach((line, idx) => {
        // Skip comment lines (JSDoc / block / line / shell) — examples in
        // prose are fine; only code references count.
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("#")) return;
        // Strip a trailing line comment from mixed code+comment lines.
        const code = line.includes("//") ? line.slice(0, line.indexOf("//")) : line;
        for (const { re, hint } of PATTERNS) {
          if (re.test(code)) {
            violations.push(`  ${path.relative(repoRoot, file)}:${idx + 1}  ${hint}: ${line.trim()}`);
          }
        }
      });
    }

    expect(
      violations,
      `Hardcoded bundled-git path(s) found. Route through ensure-bundled-git.ts.\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
