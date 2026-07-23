import type { EvictedToolBurst } from "./event-reducer.js";

/**
 * Decide how to expand a clicked `EvictedToolBurst` marker back into the
 * transcript, given the client ledger's current `minSeq`.
 *
 * - `"interior"` (`burst.fromSeq >= ledgerMinSeq`, the common case): the raw
 *   events for the whole range are still resident in the ledger — only the
 *   derived reducer rows were pruned. Expansion re-materializes them locally
 *   with NO server request and NO protocol change.
 * - `"below-floor"` (`burst.fromSeq < ledgerMinSeq`, rare — only after a ledger
 *   byte-trim dropped the raw events): expansion must page the range back in
 *   via the existing CONTIGUOUS older-paging loop (each round fetches
 *   `fromSeq = ledger.minSeq`), never a non-contiguous `[fromSeq,toSeq]` window.
 *
 * `burst.fromSeq` is an INCLUSIVE row seq (the lowest evicted tool row). The
 * boundary is inclusive: when it equals `ledgerMinSeq` the raw event is still
 * resident, so the case is `"interior"`. Keeping this off-by-one in one pure,
 * unit-tested place is the point of this helper.
 */
export function classifyExpand(burst: EvictedToolBurst, ledgerMinSeq: number): "interior" | "below-floor" {
  return burst.fromSeq >= ledgerMinSeq ? "interior" : "below-floor";
}

/**
 * Stop-predicate for the below-floor contiguous older-paging loop: true once
 * the ledger has paged its `minSeq` down to (or below) the marker's inclusive
 * `fromSeq`, meaning the whole evicted range is now resident and can be
 * re-materialized + scrolled to.
 */
export function reachedExpandTarget(ledgerMinSeq: number, targetFromSeq: number): boolean {
  return ledgerMinSeq <= targetFromSeq;
}
