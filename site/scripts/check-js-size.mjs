#!/usr/bin/env node
/**
 * Enforces the 50 KB gzipped JavaScript budget on the built site.
 *
 * Usage: npm run size  (from /site, after `npm run build`)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "..", "dist");
const BUDGET_BYTES = 50 * 1024;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (entry.endsWith(".js")) out.push(p);
  }
  return out;
}

const files = walk(DIST);
let total = 0;
console.log("\nGzipped JS sizes:\n");
for (const f of files) {
  const gz = gzipSync(readFileSync(f)).byteLength;
  total += gz;
  console.log(
    `  ${(gz / 1024).toFixed(2).padStart(7)} KB  ${f.replace(DIST + "/", "")}`,
  );
}
console.log("  ─────────");
console.log(`  ${(total / 1024).toFixed(2).padStart(7)} KB  TOTAL`);
console.log(`             budget: ${(BUDGET_BYTES / 1024).toFixed(0)} KB\n`);

if (total > BUDGET_BYTES) {
  console.error(
    `✗ over budget by ${((total - BUDGET_BYTES) / 1024).toFixed(2)} KB`,
  );
  process.exit(1);
}
console.log("✓ under budget");
