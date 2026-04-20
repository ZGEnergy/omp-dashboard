#!/usr/bin/env node
/**
 * Post-build step: gzip every file in dist/assets so the dashboard server's
 * `@fastify/static` can serve them with `preCompressed: true`.
 *
 * Why: dynamic compression via `@fastify/compress` streams responses without
 * a Content-Length header. Some HTTP/2 proxy chains (zrok free-tier in
 * particular) occasionally stream-reset such responses for browsers, which
 * Chrome surfaces as `ERR_ABORTED 500` on assets. Pre-compressed responses
 * ship with a stable Content-Length and round-trip cleanly.
 *
 * Zero-dependency — uses only Node built-ins (fs, path, zlib).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");
const assetsDir = path.join(distDir, "assets");

// Extensions worth compressing. Binary formats (png/webp/woff2) already have
// effective compression; gzipping again saves little and wastes disk.
const COMPRESSIBLE_EXT = new Set([".js", ".css", ".html", ".svg", ".json", ".map", ".txt"]);
// Skip files below this threshold — gzip overhead often outweighs savings.
const MIN_SIZE_BYTES = 1024;

function gzipFile(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < MIN_SIZE_BYTES) return null;
  const gz = zlib.gzipSync(buf, { level: zlib.constants.Z_BEST_COMPRESSION });
  fs.writeFileSync(filePath + ".gz", gz);
  return { original: buf.length, gzipped: gz.length };
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && COMPRESSIBLE_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function format(bytes) {
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + " MB";
  if (bytes > 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

const files = [...walk(assetsDir), ...walk(distDir).filter(f => f.endsWith("index.html"))];
let totalOrig = 0;
let totalGz = 0;
let count = 0;
for (const file of files) {
  // Skip existing .gz outputs from prior runs
  if (file.endsWith(".gz")) continue;
  const result = gzipFile(file);
  if (result) {
    totalOrig += result.original;
    totalGz += result.gzipped;
    count++;
  }
}

console.log(
  `[precompress] ${count} files gzipped: ${format(totalOrig)} \u2192 ${format(totalGz)} ` +
  `(${totalOrig > 0 ? Math.round((1 - totalGz / totalOrig) * 100) : 0}% saved)`,
);
