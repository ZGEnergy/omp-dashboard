/**
 * Standalone JSONL session file reader.
 * Reads pi session files without requiring @mariozechner/pi-coding-agent.
 * Falls back to linear entry order (no tree branching support).
 */
import { readFileSync, existsSync } from "node:fs";

export interface SessionEntry {
  type: string;
  id?: string;
  parentId?: string;
  timestamp?: string;
  message?: any;
  [key: string]: unknown;
}

/**
 * Load entries from a JSONL session file.
 * Returns entries in branch order (leaf→root reversed) if tree structure is present,
 * otherwise returns linear order (excluding the session header).
 */
export function loadSessionEntries(filePath: string): SessionEntry[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  const entries: SessionEntry[] = [];

  for (const line of content.trim().split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  if (entries.length === 0) return [];

  // Validate session header
  const header = entries[0];
  if (header.type !== "session" || typeof header.id !== "string") return [];

  // Build entry index for tree traversal
  const byId = new Map<string, SessionEntry>();
  let leafId: string | undefined;

  for (const entry of entries) {
    if (entry.type === "session") continue; // skip header
    if (entry.id) {
      byId.set(entry.id, entry);
      leafId = entry.id; // last entry with an id is the leaf
    }
  }

  // Check for leaf pointer in header or metadata
  for (const entry of entries) {
    if (entry.type === "leaf" && typeof entry.entryId === "string") {
      leafId = entry.entryId;
    }
  }

  // If entries have tree structure (parentId), walk from leaf to root
  if (leafId && byId.size > 0) {
    const branch: SessionEntry[] = [];
    let current = byId.get(leafId);
    while (current) {
      branch.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    if (branch.length > 0) return branch;
  }

  // Fallback: return all entries except header in order
  return entries.filter(e => e.type !== "session");
}
