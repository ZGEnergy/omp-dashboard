/**
 * Atomic JSON file read/write helpers.
 * Uses write-to-tmp + rename pattern to prevent corruption on crash.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Read and parse a JSON file. Returns `fallback` if the file doesn't exist or is invalid.
 */
export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Atomically write a JSON file (write to .tmp, then rename).
 * Creates parent directories if needed.
 *
 * Optional `mode` (e.g. `0o600` for secrets) is applied to the tmp write and
 * re-asserted via `chmod` after rename so existing group-readable files are
 * tightened on the next write.
 */
export function writeJsonFile<T>(filePath: string, data: T, opts?: { mode?: number }): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + ".tmp";
  const writeOpts = opts?.mode !== undefined ? { mode: opts.mode } : undefined;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", writeOpts);
  fs.renameSync(tmpPath, filePath);
  if (opts?.mode !== undefined) {
    try {
      fs.chmodSync(filePath, opts.mode);
    } catch {
      // Best-effort on platforms that ignore mode (or lack chmod).
    }
  }
}
