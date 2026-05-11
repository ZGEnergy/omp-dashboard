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
  /**
   * Filters whether this claim *targets* the given props (session, folder, …).
   * Failing the predicate removes the claim from the slot's claim list entirely.
   * Use for structural targeting (e.g. "only sessions whose cwd is X").
   */
  predicate?: (props: unknown) => boolean;
  /**
   * Indicates whether this claim's `Component` will produce visible output
   * for the given props. Runs synchronously alongside `predicate` but at the
   * wrapper-gate layer. When it returns `false`, the claim is NOT mounted and
   * counts as absent for `useSlotHasClaimsForSession` (so the wrapper subcard
   * hides).
   *
   * Use when the component itself conditionally returns `null` based on dynamic
   * state (e.g. "extension not installed", "user not authenticated"). MUST be
   * synchronous — plugins requiring async state must maintain a sync-readable
   * cache and default to `false` (closed) while the cache is unpopulated.
   *
   * See change: auto-hide-empty-session-subcards.
   */
  shouldRender?: (props: unknown) => boolean;
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

/**
 * Filter session-scoped claims by BOTH `predicate` AND `shouldRender`.
 *
 * Use this variant at the wrapper-gate layer (e.g. `useSlotHasClaimsForSession`,
 * slot consumers) when an empty render path should cause the parent container
 * to hide. The plain `forSession` should still be used when you only care about
 * structural targeting (e.g. counting registered claims).
 *
 * See change: auto-hide-empty-session-subcards.
 */
export function forSessionRendered(
  claims: ClaimEntry[],
  session: DashboardSession,
): ClaimEntry[] {
  return claims.filter(
    c =>
      (!c.predicate || c.predicate(session)) &&
      (!c.shouldRender || c.shouldRender(session)),
  );
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
