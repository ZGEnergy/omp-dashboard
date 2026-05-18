#!/usr/bin/env node
/**
 * Bundle-staleness sentinel for build-installer.sh.
 *
 * Three subcommands, all driven by env vars so the same script can be
 * exercised from production builds and from vitest (with a tmp tree):
 *
 *   node _bundle-stamp.mjs check
 *     → stdout: "" (cache hit) | "stamp-missing" | "source-newer:<relpath>" | "bundler-newer"
 *     → exit 0 in all cases (exit code is reserved for I/O failures)
 *
 *   node _bundle-stamp.mjs write
 *     → writes JSON { builtAt, srcMtime, bundlerMtime } to BUNDLE_STAMP_PATH
 *
 *   node _bundle-stamp.mjs age
 *     → stdout: human-readable age string ("4m ago"); "unknown" if no stamp
 *
 * Required env (validated per-subcommand):
 *   BUNDLE_STAMP_PATH   absolute path to the stamp JSON file
 *   BUNDLE_SRC_ROOTS    OS-separator (':' on POSIX, ';' on Windows) joined
 *                       list of absolute directories to scan for source mtimes
 *   BUNDLER_SCRIPT      absolute path to bundle-server.mjs
 *   PROJECT_DIR         (optional) absolute repo root, used only to print
 *                       relative paths in source-newer reasons
 *
 * See openspec/changes/fix-build-installer-stale-server-bundle/.
 */
import fs from "node:fs";
import path from "node:path";

/** File extensions that count as "tracked source". Editor swap files
 *  (.swp, ~, .#foo) and build outputs (.map, .d.ts) are excluded by virtue
 *  of not being on the list. */
const TRACKED_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".svg",
]);

/** Directories we never descend into when walking source roots.
 *  - `generated` is excluded because Vite plugins (e.g. dashboardPlugins)
 *    regenerate files inside `packages/client/src/generated/` on every build,
 *    which would otherwise defeat the cache on every invocation. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".vite",
  "out",
  "__tests__",
  ".turbo",
  "generated",
]);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(`_bundle-stamp.mjs: missing required env ${name}\n`);
    process.exit(2);
  }
  return v;
}

function splitRoots(raw) {
  // Use both ':' and ';' as separators. Windows paths use ';', POSIX uses ':',
  // and a single absolute POSIX path may itself contain ':' only on macOS
  // resource-fork paths (not our case). Split on ';' first, then ':' so the
  // common POSIX case still works.
  return raw
    .split(/[;]/)
    .flatMap((chunk) =>
      // On Windows, ':' appears after a drive letter (e.g. "C:\foo"). Detect
      // and don't split there: if a chunk starts with `<letter>:\` keep it
      // whole; otherwise split on ':'.
      /^[A-Za-z]:[\\/]/.test(chunk) ? [chunk] : chunk.split(":"),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Walk `root` recursively, invoking `onFile(absPath, mtimeSeconds)` for every
 * file whose extension is in TRACKED_EXT. Silently ignores missing roots so
 * the helper works on partial trees (relevant for tests).
 */
function walk(root, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, onFile);
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (!TRACKED_EXT.has(ext)) continue;
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      onFile(full, st.mtimeMs / 1000);
    }
  }
}

/** Returns { mtime, file } for the newest tracked source file across roots. */
function computeSrcMtime(roots) {
  let mtime = 0;
  let file = null;
  for (const root of roots) {
    walk(root, (full, m) => {
      if (m > mtime) {
        mtime = m;
        file = full;
      }
    });
  }
  return { mtime, file };
}

/** Returns the first file across roots whose mtime exceeds `threshold`,
 *  or null if no such file exists. Short-circuits per root. */
function findNewerThan(roots, threshold) {
  for (const root of roots) {
    let hit = null;
    walk(root, (full, m) => {
      if (hit) return;
      if (m > threshold) hit = full;
    });
    if (hit) return hit;
  }
  return null;
}

function bundlerMtime() {
  return fs.statSync(requireEnv("BUNDLER_SCRIPT")).mtimeMs / 1000;
}

function readStamp() {
  const p = requireEnv("BUNDLE_STAMP_PATH");
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatAge(stamp) {
  const builtAtMs = new Date(stamp.builtAt).getTime();
  if (Number.isNaN(builtAtMs)) return "unknown";
  const ageSec = Math.max(0, (Date.now() - builtAtMs) / 1000);
  if (ageSec < 60) return `${Math.round(ageSec)}s ago`;
  if (ageSec < 3600) return `${Math.round(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.round(ageSec / 3600)}h ago`;
  return `${Math.round(ageSec / 86400)}d ago`;
}

function cmdCheck() {
  const stamp = readStamp();
  if (!stamp || typeof stamp.srcMtime !== "number" || typeof stamp.bundlerMtime !== "number") {
    process.stdout.write("stamp-missing");
    return;
  }
  const roots = splitRoots(requireEnv("BUNDLE_SRC_ROOTS"));
  const newer = findNewerThan(roots, stamp.srcMtime);
  if (newer) {
    const projectDir = process.env.PROJECT_DIR;
    const rel = projectDir ? path.relative(projectDir, newer) : newer;
    process.stdout.write(`source-newer:${rel}`);
    return;
  }
  if (bundlerMtime() > stamp.bundlerMtime) {
    process.stdout.write("bundler-newer");
    return;
  }
  // Cache hit: empty stdout.
}

function cmdWrite() {
  const roots = splitRoots(requireEnv("BUNDLE_SRC_ROOTS"));
  const { mtime: srcMtime } = computeSrcMtime(roots);
  const stamp = {
    builtAt: new Date().toISOString(),
    srcMtime,
    bundlerMtime: bundlerMtime(),
  };
  const out = requireEnv("BUNDLE_STAMP_PATH");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(stamp, null, 2) + "\n");
}

function cmdAge() {
  const stamp = readStamp();
  if (!stamp) {
    process.stdout.write("unknown");
    return;
  }
  process.stdout.write(formatAge(stamp));
}

const cmd = process.argv[2];
switch (cmd) {
  case "check":
    cmdCheck();
    break;
  case "write":
    cmdWrite();
    break;
  case "age":
    cmdAge();
    break;
  default:
    process.stderr.write(
      `_bundle-stamp.mjs: unknown command "${cmd ?? ""}" — expected check|write|age\n`,
    );
    process.exit(2);
}
