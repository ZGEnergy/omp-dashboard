#!/usr/bin/env node
/**
 * Shell-callable resolver wrapper for the dashboard's ToolRegistry.
 *
 * Invoked by build-time scripts (CI workflows, Dockerfiles, postinstall
 * helpers) that cannot import the shared package's TypeScript directly.
 * Produces a path-only resolution for a single tool name on stdout.
 *
 * Usage:
 *   node packages/shared/bin/pi-dashboard-resolve-tool.cjs <tool-name>
 *   node packages/shared/bin/pi-dashboard-resolve-tool.cjs <tool-name> --json
 *
 * Behavior matrix:
 *   --json absent:
 *     ok=true   → stdout: <abs-path>\n     exit 0
 *     ok=false  → stderr: <error>          exit 1
 *   --json present:
 *     ok=true   → stdout: { Resolution }   exit 0
 *     ok=false  → stdout: { Resolution }   exit 0
 *
 * IMPORTANT: This script is a self-contained mirror of the registry's
 * `bare-import` and `override` strategies for a small allowlist of
 * build-time tools (electron, node-pty). It does NOT import the shared
 * package's TypeScript — build-time consumers run before any TS build
 * has occurred, and the wrapper must be CommonJS + dependency-free.
 *
 * The strategy chain MUST stay in sync with
 *   packages/shared/src/tool-registry/definitions.ts
 * Both implement the SAME `bare-import` semantics; if you change one,
 * change the other. The lint test
 *   packages/shared/src/__tests__/no-hardcoded-node-modules-paths.test.ts
 * enforces that no other build-time site re-rolls this logic by hand.
 *
 * See change: register-build-time-tools.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");

// ─── Tool registry (mirror of definitions.ts for build-time tools) ──────────
//
// Each entry:
//   pkgName      — the npm package id (also used as the require.resolve target).
//   searchPaths  — optional `paths` hint forwarded to require.resolve so that
//                  hoisted-root vs nested-workspace layouts both resolve.
//   description  — human-readable, surfaced in error messages.
//
// The strategy order is hardcoded: override → bare-import.
// Add new build-time tools here AND register them in definitions.ts.

const REPO_ROOT = findRepoRoot(__dirname);

const TOOLS = {
  electron: {
    pkgName: "electron",
    searchPaths: REPO_ROOT ? [path.join(REPO_ROOT, "packages", "electron")] : undefined,
    description: "Electron — package directory containing install.js.",
  },
  "node-pty": {
    pkgName: "node-pty",
    searchPaths: undefined,
    description: "node-pty — package directory containing prebuilds/.",
  },
};

// ─── Strategies ──────────────────────────────────────────────────────────────

function overridesPath() {
  return path.join(os.homedir(), ".omp", "dashboard", "tool-overrides.json");
}

function tryOverride(toolName) {
  const filePath = overridesPath();
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return { ok: false, reason: "no override set" };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "overrides file is not valid JSON" };
  }
  const entry = parsed && parsed.overrides && parsed.overrides[toolName];
  const overridePath = entry && entry.path;
  if (!overridePath) return { ok: false, reason: "no override set" };
  if (!fs.existsSync(overridePath)) {
    return { ok: false, reason: `invalid: path does not exist: ${overridePath}` };
  }
  return { ok: true, path: overridePath };
}

function tryBareImport(toolName, def) {
  // Anchor `createRequire` at the repo root's package.json so hoisted root
  // node_modules is reachable even when invoked from a subdirectory.
  const anchor = REPO_ROOT
    ? path.join(REPO_ROOT, "package.json")
    : path.join(__dirname, "..", "..", "..", "package.json");
  let req;
  try {
    req = createRequire(anchor);
  } catch (err) {
    return { ok: false, reason: `cannot create require from ${anchor}: ${err.message}` };
  }
  const id = `${def.pkgName}/package.json`;
  let resolved;
  try {
    if (def.searchPaths && def.searchPaths.length > 0) {
      resolved = req.resolve(id, { paths: def.searchPaths });
    } else {
      resolved = req.resolve(id);
    }
  } catch (err) {
    return { ok: false, reason: `cannot resolve ${id}: ${err.message}` };
  }
  return { ok: true, path: path.dirname(resolved) };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function findRepoRoot(startDir) {
  // Walk up from startDir until a package.json with `"workspaces"` is found.
  // That's the repo root. Returns null if not found within reasonable depth.
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json");
    try {
      const content = fs.readFileSync(pkg, "utf8");
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.workspaces)) return dir;
    } catch {
      // not a package.json or unreadable — keep walking
    }
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return null;
}

function resolveTool(toolName) {
  const def = TOOLS[toolName];
  const tried = [];
  if (!def) {
    return {
      name: toolName,
      ok: false,
      path: null,
      source: null,
      tried: [],
      resolvedAt: Date.now(),
      _unknown: true,
    };
  }
  // Strategy 1: override
  const ov = tryOverride(toolName);
  tried.push({ strategy: "override", result: ov.ok ? "ok" : ov.reason });
  if (ov.ok) {
    return {
      name: toolName,
      ok: true,
      path: ov.path,
      source: "override",
      tried,
      resolvedAt: Date.now(),
    };
  }
  // Strategy 2: bare-import
  const bi = tryBareImport(toolName, def);
  tried.push({ strategy: "bare-import", result: bi.ok ? "ok" : bi.reason });
  if (bi.ok) {
    return {
      name: toolName,
      ok: true,
      path: bi.path,
      source: "bare-import",
      tried,
      resolvedAt: Date.now(),
    };
  }
  return {
    name: toolName,
    ok: false,
    path: null,
    source: null,
    tried,
    resolvedAt: Date.now(),
  };
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("--"));
  const toolName = positional[0];

  if (!toolName) {
    process.stderr.write(
      "usage: pi-dashboard-resolve-tool <tool-name> [--json]\n" +
        `  registered: ${Object.keys(TOOLS).join(", ")}\n`,
    );
    process.exit(1);
  }

  const res = resolveTool(toolName);

  if (res._unknown) {
    if (json) {
      // Treat unknown tools as a non-zero exit even with --json, to match
      // the registry's UnknownToolError behavior. Spec scenario "Resolver
      // fails on unknown tool".
      process.stderr.write(`tool '${toolName}' is not registered\n`);
      process.exit(1);
    }
    process.stderr.write(
      `tool '${toolName}' is not registered\n` +
        `  registered: ${Object.keys(TOOLS).join(", ")}\n`,
    );
    process.exit(1);
  }

  if (json) {
    // Strip internal flag before printing.
    const { _unknown: _u, ...clean } = res;
    process.stdout.write(JSON.stringify(clean) + "\n");
    process.exit(0);
  }

  if (res.ok) {
    process.stdout.write(res.path + "\n");
    process.exit(0);
  }

  // Failure (no --json) — print trail to stderr.
  const trail = res.tried.map((t) => `  - ${t.strategy}: ${t.result}`).join("\n");
  process.stderr.write(
    `cannot resolve '${toolName}'. Tried:\n${trail}\n`,
  );
  process.exit(1);
}

main(process.argv);
