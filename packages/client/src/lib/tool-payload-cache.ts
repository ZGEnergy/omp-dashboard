/**
 * Byte ceiling for re-inflated tool payloads. Deliberately small relative to
 * the transcript budget: this cache exists so a user can inspect a few degraded
 * tool rows, not so the transcript can be reassembled in full.
 */
export const TOOL_PAYLOAD_CACHE_BYTES = 4 * 1024 * 1024;

export interface CachedPayload {
  payload: string;
  truncated: boolean;
}

/**
 * Short-lived LRU for payloads fetched via `fetch_tool_payload`, keyed by
 * `toolCallId`.
 *
 * Fetched payloads MUST NOT enter the replay ledger. Re-inflating a handful of
 * old tools into the ledger would walk the client straight back into the memory
 * ceiling that eviction just relieved, and would also corrupt ledger byte
 * accounting. This cache is their separate home: purely derived state, safe to
 * drop at any moment, never a source for the reducer.
 *
 * Recency order is the `Map` insertion order — a read re-inserts its key.
 * See change: hydration-tool-stub-projection.
 */
export class ToolPayloadCache {
  private readonly entries = new Map<string, CachedPayload>();
  private total = 0;

  get bytes(): number {
    return this.total;
  }

  get(toolCallId: string): CachedPayload | undefined {
    const entry = this.entries.get(toolCallId);
    if (!entry) return undefined;
    // Re-insert to mark most-recently-used.
    this.entries.delete(toolCallId);
    this.entries.set(toolCallId, entry);
    return entry;
  }

  has(toolCallId: string): boolean {
    return this.entries.has(toolCallId);
  }

  set(toolCallId: string, payload: string, truncated: boolean): void {
    const existing = this.entries.get(toolCallId);
    if (existing) {
      this.entries.delete(toolCallId);
      this.total -= existing.payload.length;
    }
    // A payload larger than the whole ceiling could never be retained without
    // evicting everything and still overflowing — drop it rather than thrash.
    if (payload.length > TOOL_PAYLOAD_CACHE_BYTES) return;
    this.entries.set(toolCallId, { payload, truncated });
    this.total += payload.length;
    while (this.total > TOOL_PAYLOAD_CACHE_BYTES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      const victim = this.entries.get(oldest.value)!;
      this.entries.delete(oldest.value);
      this.total -= victim.payload.length;
    }
  }

  clear(): void {
    this.entries.clear();
    this.total = 0;
  }
}
