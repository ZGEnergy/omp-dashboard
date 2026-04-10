/**
 * Directory browsing logic for the browse API endpoint.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { BrowseEntry, BrowseResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

const MAX_ENTRIES = 200;

/**
 * List subdirectories of a given path.
 * Excludes hidden directories (starting with ".").
 * Detects .git and .pi subdirectories for visual hints.
 * Caps at 200 entries, sorted alphabetically.
 */
export async function listDirectories(dirPath?: string): Promise<BrowseResult> {
  const resolved = dirPath ?? os.homedir();

  // Verify the directory exists and is a directory
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error("not a directory");
  }

  const rawEntries = await fs.readdir(resolved, { withFileTypes: true });

  // Filter: directories only, no hidden dirs
  const dirs = rawEntries.filter(
    (e) => e.isDirectory() && !e.name.startsWith(".")
  );

  // Sort alphabetically
  dirs.sort((a, b) => a.name.localeCompare(b.name));

  // Cap at MAX_ENTRIES
  const capped = dirs.slice(0, MAX_ENTRIES);

  // Build entries with isGit/isPi detection
  const entries: BrowseEntry[] = await Promise.all(
    capped.map(async (d) => {
      const fullPath = path.join(resolved, d.name);
      const [isGit, isPi] = await Promise.all([
        fs.access(path.join(fullPath, ".git")).then(() => true, () => false),
        fs.access(path.join(fullPath, ".pi")).then(() => true, () => false),
      ]);
      return { name: d.name, path: fullPath, isGit, isPi };
    })
  );

  // Parent: null for root
  const parent = resolved === "/" ? null : path.dirname(resolved);

  return { entries, parent, current: resolved };
}
