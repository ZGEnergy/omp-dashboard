/**
 * Safe realpath resolution — resolves symlinks, falls back to original on error.
 */
import fs from "node:fs";

export function safeRealpathSync(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}
