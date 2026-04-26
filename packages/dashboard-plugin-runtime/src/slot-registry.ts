/**
 * Typed slot registry for the dashboard plugin system.
 *
 * The registry holds a Map<SlotId, ClaimEntry[]> pre-sorted by
 * (priority asc, pluginId asc) for deterministic render order.
 */
import type { SlotId } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/slot-types.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";

/** A folder descriptor for sidebar-folder-section filtering. */
export interface FolderDescriptor {
  cwd: string;
  label?: string;
}

/** A resolved slot claim entry held in the registry. */
export interface ClaimEntry {
  pluginId: string;
  priority: number;
  slot: SlotId;
  componentName?: string;
  command?: string;
  trigger?: string;
  toolName?: string;
  tab?: string;
  config?: Record<string, unknown>;
  predicate?: (props: unknown) => boolean;
  /** The resolved React component (set at registration time). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component?: React.ComponentType<any>;
}

export interface SlotRegistry {
  /** All claims for the given slot, pre-sorted. */
  getClaims(slotId: SlotId): ClaimEntry[];
  /** All claims across all slots. */
  getAllClaims(): ClaimEntry[];
  /** Add a claim. Inserts in sorted order. */
  addClaim(claim: ClaimEntry): void;
  /** Remove all claims belonging to a plugin. */
  removeClaims(pluginId: string): void;
}

function compareClaims(a: ClaimEntry, b: ClaimEntry): number {
  const pa = a.priority ?? 1000;
  const pb = b.priority ?? 1000;
  if (pa !== pb) return pa - pb;
  return a.pluginId.localeCompare(b.pluginId);
}

export function createSlotRegistry(): SlotRegistry {
  const store = new Map<SlotId, ClaimEntry[]>();

  function getBucket(slotId: SlotId): ClaimEntry[] {
    if (!store.has(slotId)) store.set(slotId, []);
    return store.get(slotId)!;
  }

  return {
    getClaims(slotId: SlotId): ClaimEntry[] {
      return store.get(slotId) ?? [];
    },

    getAllClaims(): ClaimEntry[] {
      const all: ClaimEntry[] = [];
      for (const claims of store.values()) all.push(...claims);
      return all;
    },

    addClaim(claim: ClaimEntry): void {
      const bucket = getBucket(claim.slot);
      bucket.push(claim);
      bucket.sort(compareClaims);
    },

    removeClaims(pluginId: string): void {
      for (const [slotId, claims] of store.entries()) {
        const filtered = claims.filter(c => c.pluginId !== pluginId);
        store.set(slotId, filtered);
      }
    },
  };
}

// ── Filter helpers ───────────────────────────────────────────────────────────

/** Filter session-scoped claims using the claim's optional predicate. */
export function forSession(claims: ClaimEntry[], session: DashboardSession): ClaimEntry[] {
  return claims.filter(c => !c.predicate || c.predicate(session));
}

/** Filter folder-scoped claims using the claim's optional predicate. */
export function forFolder(claims: ClaimEntry[], folder: FolderDescriptor): ClaimEntry[] {
  return claims.filter(c => !c.predicate || c.predicate(folder));
}

/** Filter command-route claims by command string. */
export function forCommand(claims: ClaimEntry[], command: string): ClaimEntry[] {
  return claims.filter(c => c.command === command);
}

/** Filter settings-section claims by tab. */
export function forTab(claims: ClaimEntry[], tab: string): ClaimEntry[] {
  return claims.filter(c => (c.tab ?? "general") === tab);
}

/** Filter tool-renderer claims by tool name. */
export function forToolName(claims: ClaimEntry[], toolName: string): ClaimEntry[] {
  return claims.filter(c => c.toolName === toolName);
}
