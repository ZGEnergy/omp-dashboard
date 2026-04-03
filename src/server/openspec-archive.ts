import fs from "node:fs/promises";
import path from "node:path";

export interface ArchiveEntry {
  /** Full directory name, e.g. "2026-03-27-openspec-artifact-reader" */
  name: string;
  /** Date extracted from the prefix, e.g. "2026-03-27" */
  date: string;
  /** Detected artifacts with status "done" */
  artifacts: { id: string; status: "done" }[];
}

const ARTIFACT_FILES: Record<string, string> = {
  proposal: "proposal.md",
  design: "design.md",
  tasks: "tasks.md",
};

const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})-/;

/**
 * Scan the openspec/changes/archive/ directory and return structured entries.
 */
export async function scanOpenSpecArchive(cwd: string): Promise<ArchiveEntry[]> {
  const archiveDir = path.join(cwd, "openspec", "changes", "archive");

  let entries: string[];
  try {
    entries = await fs.readdir(archiveDir);
  } catch {
    return [];
  }

  const results: ArchiveEntry[] = [];

  for (const entry of entries) {
    const match = DATE_PREFIX_RE.exec(entry);
    if (!match) continue;

    const entryPath = path.join(archiveDir, entry);
    const stat = await fs.stat(entryPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const artifacts: { id: string; status: "done" }[] = [];

    // Check standard artifact files
    for (const [id, filename] of Object.entries(ARTIFACT_FILES)) {
      const exists = await fs.stat(path.join(entryPath, filename)).then(() => true, () => false);
      if (exists) artifacts.push({ id, status: "done" });
    }

    // Check specs directory
    const specsExists = await fs.stat(path.join(entryPath, "specs")).then(
      (s) => s.isDirectory(),
      () => false,
    );
    if (specsExists) artifacts.push({ id: "specs", status: "done" });

    results.push({ name: entry, date: match[1], artifacts });
  }

  // Sort newest-first
  results.sort((a, b) => b.name.localeCompare(a.name));

  return results;
}
