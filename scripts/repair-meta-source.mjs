#!/usr/bin/env node
/**
 * repair-meta-source.mjs
 *
 * One-shot cleanup for `.meta.json` sidecars that carry an incorrect
 * `source: "dashboard"` tag.
 *
 * Background: before commits `5a31daa6` (strong signal) +
 * `fix-dashboard-spawn-correlation-by-token` (persistMeta gate), the
 * dashboard server could stamp `source: "dashboard"` on a sidecar
 * purely because a CLI pi happened to launch in a cwd where the
 * dashboard had recently issued a Spawn. The resulting `.jsonl` does
 * NOT carry any TUI-vs-dashboard marker, so we cannot distinguish
 * mis-stamped sidecars from correct ones after the fact.
 *
 * Strategy: remove `source: "dashboard"` from EVERY sidecar.
 *   - Live dashboard sessions re-stamp themselves on the next bridge
 *     reattach via `PI_DASHBOARD_SPAWN_TOKEN` (the strong signal).
 *   - Dead/archived sessions lose the tag permanently \u2014 acceptable,
 *     they cannot be reattached or interacted with.
 *
 * Idempotent: a second run after success reports `cleaned 0`.
 *
 * Exit codes:
 *   0 \u2014 success (errors counted in the summary do NOT change the
 *        exit code; only unrecoverable failures \u2014 e.g. cannot read
 *        $HOME \u2014 exit non-zero).
 *   1 \u2014 unrecoverable error (missing $HOME, cannot read sessions root).
 *
 * Usage:
 *   node scripts/repair-meta-source.mjs [--dry-run] [--sessions-root <path>]
 *
 * See change: fix-dashboard-spawn-correlation-by-token.
 */
import { readdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";

/**
 * Walk `dir` recursively and yield every `*.meta.json` path.
 * Tolerates EACCES / ENOENT on subdirectories (counts toward errors).
 *
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* walkMetaFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // swallow; caller treats absence as 0 files
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMetaFiles(full);
    } else if (entry.isFile() && entry.name.endsWith(".meta.json")) {
      yield full;
    }
  }
}

/**
 * Atomic write: write to a sibling .tmp file then rename.
 *
 * @param {string} dest
 * @param {string} content
 */
async function atomicWrite(dest, content) {
  const tmp = `${dest}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, dest);
}

/**
 * Process a single .meta.json file.
 *
 * @param {string} file
 * @param {boolean} dryRun
 * @returns {Promise<"kept" | "cleaned" | "error">}
 */
async function processFile(file, dryRun) {
  let raw;
  try {
    raw = await readFile(file, "utf-8");
  } catch {
    return "error";
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return "error";
  }
  if (!obj || typeof obj !== "object" || obj.source !== "dashboard") {
    return "kept";
  }
  delete obj.source;
  if (dryRun) return "cleaned";
  try {
    await atomicWrite(file, JSON.stringify(obj, null, 2) + "\n");
    return "cleaned";
  } catch {
    return "error";
  }
}

function parseArgs(argv) {
  const out = { dryRun: false, root: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--sessions-root") out.root = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/repair-meta-source.mjs [--dry-run] [--sessions-root <path>]",
      );
      process.exit(0);
    }
  }
  return out;
}

export async function repairMetaSource(root, { dryRun = false } = {}) {
  let kept = 0;
  let cleaned = 0;
  let errors = 0;
  for await (const file of walkMetaFiles(root)) {
    const result = await processFile(file, dryRun);
    if (result === "kept") kept++;
    else if (result === "cleaned") cleaned++;
    else errors++;
  }
  return { kept, cleaned, errors };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const home = process.env.HOME || os.homedir();
  if (!home) {
    console.error("repair-meta-source: cannot determine HOME directory");
    process.exit(1);
  }
  const root = args.root ?? path.join(home, ".omp", "agent", "sessions");

  if (!existsSync(root)) {
    console.log(`repair-meta-source: sessions root not found at ${root}`);
    console.log("kept 0 / cleaned 0 / errors 0");
    process.exit(0);
  }

  try {
    await stat(root);
  } catch {
    console.error(`repair-meta-source: cannot stat ${root}`);
    process.exit(1);
  }

  const { kept, cleaned, errors } = await repairMetaSource(root, {
    dryRun: args.dryRun,
  });
  const prefix = args.dryRun ? "[dry-run] " : "";
  console.log(`${prefix}kept ${kept} / cleaned ${cleaned} / errors ${errors}`);
  process.exit(0);
}

// Run as CLI only when invoked directly.
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("repair-meta-source.mjs");
if (invokedDirectly) {
  main().catch((err) => {
    console.error("repair-meta-source: unexpected error", err);
    process.exit(1);
  });
}
