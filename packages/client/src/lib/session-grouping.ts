/**
 * Pure utility functions for grouping, sorting, and filtering sessions.
 * Extracted from SessionList.tsx for reuse and testability.
 */
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { TerminalSession } from "@blackbelt-technology/pi-dashboard-shared/terminal-types.js";

export interface DirectoryGroup {
  cwd: string;
  sessions: DashboardSession[];
  pinned: boolean;
}

/** Sort sessions within a group by server order, then by startedAt descending for unordered ones. */
export function sortSessionsByOrder(sessions: DashboardSession[], order?: string[]): DashboardSession[] {
  if (!order || order.length === 0) {
    return [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  }
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const ordered: DashboardSession[] = [];
  const unordered: DashboardSession[] = [];
  for (const s of sessions) {
    if (orderIndex.has(s.id)) {
      ordered.push(s);
    } else {
      unordered.push(s);
    }
  }
  ordered.sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);
  unordered.sort((a, b) => b.startedAt - a.startedAt);
  return [...ordered, ...unordered];
}

/** Get unified order of session + terminal IDs for a group. */
export function getUnifiedOrder(sessions: DashboardSession[], terminals: TerminalSession[], order?: string[]): string[] {
  const allIds = new Set([...sessions.map((s) => s.id), ...terminals.map((t) => t.id)]);
  if (!order || order.length === 0) {
    // Default: terminals first (newest first), then sessions (newest first)
    return [
      ...terminals.sort((a, b) => b.createdAt - a.createdAt).map((t) => t.id),
      ...sessions.sort((a, b) => b.startedAt - a.startedAt).map((s) => s.id),
    ];
  }
  const ordered = order.filter((id) => allIds.has(id));
  const unordered = [...allIds].filter((id) => !new Set(ordered).has(id));
  return [...ordered, ...unordered];
}

/** Group sessions by cwd, with pinned directories first (in pinned order), then unpinned sorted by recency. */
export function groupSessionsByDirectory(
  sessions: DashboardSession[],
  orderMap?: Map<string, string[]>,
  pinnedDirectories?: string[],
): { pinned: DirectoryGroup[]; unpinned: DirectoryGroup[] } {
  const groups = new Map<string, DashboardSession[]>();
  for (const session of sessions) {
    const existing = groups.get(session.cwd);
    if (existing) {
      existing.push(session);
    } else {
      groups.set(session.cwd, [session]);
    }
  }

  const pinnedSet = new Set(pinnedDirectories ?? []);

  // Build pinned groups in pinned order (including zero-session groups)
  const pinned: DirectoryGroup[] = [];
  for (const dir of pinnedDirectories ?? []) {
    pinned.push({
      cwd: dir,
      sessions: sortSessionsByOrder(groups.get(dir) ?? [], orderMap?.get(dir)),
      pinned: true,
    });
  }

  // Build unpinned groups sorted by most recent activity
  const unpinned = Array.from(groups.entries())
    .filter(([cwd]) => !pinnedSet.has(cwd))
    .map(([cwd, groupSessions]) => ({
      cwd,
      sessions: sortSessionsByOrder(groupSessions, orderMap?.get(cwd)),
      pinned: false,
    }))
    .sort((a, b) => {
      const aMax = Math.max(...a.sessions.map((s) => s.startedAt));
      const bMax = Math.max(...b.sessions.map((s) => s.startedAt));
      return bMax - aMax;
    });

  return { pinned, unpinned };
}

/** Apply filter pipeline: active-only → hidden → visible sessions */
export function filterSessions(
  sessions: DashboardSession[],
  activeOnly: boolean,
  showHidden: boolean,
): DashboardSession[] {
  return sessions.filter((s) => {
    if (activeOnly && s.status === "ended") return false;
    if (s.hidden && !showHidden) return false;
    return true;
  });
}
