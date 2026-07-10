#!/usr/bin/env node
/**
 * omp-codemod - mechanical pi->omp substitutions for the Oh My Pi fork.
 *
 * Re-runnable after every `git merge upstream/develop` so the human-authored
 * diff stays tiny. It ONLY does safe, mechanical rewrites:
 *
 *   1. pi SDK package scope: the legacy `earendil-works` / `mariozechner`
 *      scopes on `pi-*` packages are rewritten to the `oh-my-pi` scope, in
 *      source imports AND in package.json dependency keys/values. Dependency
 *      objects are de-duplicated when both legacy scopes collapse onto the
 *      same oh-my-pi name, and pi-scope dependency VERSION ranges are
 *      normalized to `*` (host-provided at runtime; upstream pins pi's own
 *      version line which is meaningless under the oh-my-pi scope).
 *
 *   2. On-disk agent/dashboard directory segments in CODE files:
 *        the dot-pi dir segment -> the dot-omp segment  (e.g. ~/.pi/agent ->
 *        ~/.omp/agent, ~/.pi/dashboard -> ~/.omp/dashboard), and the legacy
 *        managed-install dir -> its omp equivalent. Bounded by quote / slash /
 *        backtick so it only rewrites real path segments, never identifiers
 *        like `foo.pi` or words like `.pipeline`.
 *
 * It does NOT touch the extension manifest key (pkg.pi -> pkg.omp), CLI names,
 * or branding - those are semantic and live in hand-authored commits so they
 * survive merges intentionally.
 *
 * Usage:  node scripts/omp-codemod.mjs [--check]
 *   --check  exit 1 if any file WOULD change (CI drift guard), write nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const CHECK = process.argv.includes("--check");

// Legacy pi scopes, assembled at runtime so this file never rewrites itself.
const LEGACY = ["earendil" + "-works", "mario" + "zechner"];
const OMP = "oh-my-pi";
const SCOPE_RE = new RegExp(`@(?:${LEGACY.join("|")})/pi-`, "g");
const SCOPE_TO = `@${OMP}/pi-`;
const OMP_PI_KEY = new RegExp(`^@${OMP}/pi-`);

// Path-segment rewrites (code files only). Managed dir first; then the plain
// dot-pi segment bounded by quote/slash/backtick on BOTH sides.
const MANAGED_RE = /(['"`/])\.pi-dashboard\b/g;
const DOTPI_RE = /(['"`/])\.pi(?=['"`/])/g;

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "out", "site", ".vite", "build",
  "coverage", ".turbo",
]);
const CODE_EXT = new Set([".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx", ".sh"]);
const DEP_KEYS = [
  "dependencies", "devDependencies", "peerDependencies",
  "optionalDependencies", "peerDependenciesMeta", "bundledDependencies",
];

function walk(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(full, acc);
    } else if (ent.isFile() && full !== SELF) {
      acc.push(full);
    }
  }
  return acc;
}

/** Rename dep keys, collapse legacy dupes, normalize pi-scope versions to `*`. */
function renameDepObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = k.replace(SCOPE_RE, SCOPE_TO);
    let nv = v;
    if (typeof v === "string") nv = OMP_PI_KEY.test(nk) ? "*" : v.replace(SCOPE_RE, SCOPE_TO);
    out[nk] = nv; // collision -> last wins, collapsing legacy dupes
  }
  return out;
}

function rewritePackageJson(text) {
  if (!SCOPE_RE.test(text)) return null;
  SCOPE_RE.lastIndex = 0;
  let pkg;
  try { pkg = JSON.parse(text); } catch { return text.replace(SCOPE_RE, SCOPE_TO); }
  for (const key of DEP_KEYS) {
    if (pkg[key] && typeof pkg[key] === "object") pkg[key] = renameDepObject(pkg[key]);
  }
  return JSON.stringify(pkg, null, 2).replace(SCOPE_RE, SCOPE_TO) + "\n";
}

function rewriteCode(text) {
  const next = text
    .replace(SCOPE_RE, SCOPE_TO)
    .replace(MANAGED_RE, "$1.omp-dashboard")
    .replace(DOTPI_RE, "$1.omp");
  return next === text ? null : next;
}

const changed = [];
for (const file of walk(ROOT, [])) {
  const base = path.basename(file);
  const ext = path.extname(file);
  const text = fs.readFileSync(file, "utf8");
  let next = null;
  if (base === "package.json") next = rewritePackageJson(text);
  else if (CODE_EXT.has(ext)) next = rewriteCode(text);
  else continue;
  if (next == null || next === text) continue;
  changed.push(path.relative(ROOT, file));
  if (!CHECK) fs.writeFileSync(file, next);
}

if (CHECK) {
  if (changed.length) {
    console.error(`omp-codemod: ${changed.length} file(s) would change:`);
    for (const f of changed) console.error("  " + f);
    process.exit(1);
  }
  console.log("omp-codemod: clean (no drift)");
} else {
  console.log(`omp-codemod: rewrote ${changed.length} file(s)`);
}
