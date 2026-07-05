/**
 * In-memory event store with LRU eviction.
 * Replaces SQLite-backed event-store.ts.
 */
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";

export interface StoredEvent {
  seq: number;
  event: DashboardEvent;
}

export interface EventStore {
  /** Insert an event, returns assigned sequence number */
  insertEvent(sessionId: string, event: DashboardEvent): number;
  /** Get events for a session starting from minSeq (inclusive) */
  getEvents(sessionId: string, minSeq: number): StoredEvent[];
  /** Get a single event by sessionId and seq */
  getEvent(sessionId: string, seq: number): DashboardEvent | undefined;
  /**
   * Find the most recent `tool_execution_end` event for a tool call. Pure
   * read; returns undefined when the call is still in flight or its event was
   * evicted under memory pressure. See change: adopt-pi-071-072-073-features.
   */
  findToolEndEvent(sessionId: string, toolCallId: string): DashboardEvent | undefined;
  /** Delete all events for a specific session */
  deleteEventsForSession(sessionId: string): number;
  /** Check if session has events in memory */
  hasEvents(sessionId: string): boolean;
  /** Return the highest seq for a session, or 0 if no events */
  getMaxSeq(sessionId: string): number;
  /** Number of cached sessions */
  sessionCount(): number;
}

interface SessionBuffer {
  events: StoredEvent[];
  nextSeq: number;
  lastAccess: number;
}

export const DEFAULT_MAX_CACHED_SESSIONS = 100;
// Raised 5000 → 20000: sessions that run subagents forward every subagent
// lifecycle + inner tool-call/result event into the PARENT session buffer, so a
// single subagent-heavy turn can emit thousands of events and blow the old cap,
// trimming the start of the chat. See change: preserve-chat-head-on-event-trim.
export const DEFAULT_MAX_EVENTS_PER_SESSION = 20000;

/**
 * Event types that carry the visible conversation transcript. The per-session
 * trim NEVER drops these — only the surrounding heavy/ephemeral events
 * (tool_execution_*, subagent_*, flow_*, reasoning, stats_update, streaming
 * message_update deltas). `message_start` + `message_end` are sufficient to
 * rebuild a completed message's text on the client (the finalized content lands
 * at message_end; intermediate `message_update` deltas only matter for the
 * still-streaming tail, which is newest and never trimmed).
 * See change: preserve-chat-head-on-event-trim.
 */
const ESSENTIAL_CHAT_EVENT_TYPES: ReadonlySet<string> = new Set([
  "message_start",
  "message_end",
]);

/**
 * Trim `buf.events` down to `cap` in a SINGLE O(n) pass, dropping the oldest
 * NON-essential events first (tool/subagent/flow/reasoning/stats/streaming
 * noise) and only dropping the oldest essential chat events when essentials
 * alone exceed the cap. Reassigns `buf.events`; safe because seq values ride
 * on the surviving entries and `getEvents` filters by seq (gaps are fine).
 * See change: preserve-chat-head-on-event-trim.
 */
function trimBufferToLimit(buf: SessionBuffer, cap: number): void {
  let toDrop = buf.events.length - cap;
  if (toDrop <= 0) return;
  const kept: StoredEvent[] = [];
  // Pass 1 (fused into the copy): drop the oldest non-essential entries.
  for (const e of buf.events) {
    if (toDrop > 0 && !ESSENTIAL_CHAT_EVENT_TYPES.has(e.event.eventType)) {
      toDrop--;
      continue;
    }
    kept.push(e);
  }
  // Pass 2: essentials alone still exceed the cap → drop oldest essentials to
  // hold the memory bound (pathological; cap is 20000 so never hit in practice).
  if (kept.length > cap) kept.splice(0, kept.length - cap);
  buf.events = kept;
}

/** Default max size for any string field within event data */
const DEFAULT_MAX_STRING_SIZE = 4_000;
/** Max total serialized size for an individual event's data */
const MAX_EVENT_DATA_SIZE = 20_000;

/**
 * Recursively truncate large string fields in an object.
 * Returns a new object if any truncation occurred, otherwise the original.
 */
function truncateStrings(obj: unknown, maxSize: number, depth = 0): unknown {
  if (depth > 4) return obj;
  if (typeof obj === "string") {
    return obj.length > maxSize ? obj.slice(0, maxSize) + "\n…[truncated]" : obj;
  }
  if (Array.isArray(obj)) {
    // Skip large arrays (e.g., edits arrays)
    if (obj.length > 20) return "[array truncated]";
    let changed = false;
    const result = obj.map((item) => {
      const t = truncateStrings(item, maxSize, depth + 1);
      if (t !== item) changed = true;
      return t;
    });
    return changed ? result : obj;
  }
  if (obj && typeof obj === "object") {
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      // Preserve base64 image data — skip truncation when sibling mimeType exists
      if (key === "data" && typeof val === "string" && "mimeType" in obj) {
        result[key] = val;
        continue;
      }
      // Skip 'thinking' blocks entirely — large and not shown in chat
      if (key === "thinking" && typeof val === "string" && val.length > maxSize) {
        result[key] = (val as string).slice(0, 500) + "\n…[truncated]";
        changed = true;
        continue;
      }
      const t = truncateStrings(val, maxSize, depth + 1);
      if (t !== val) changed = true;
      result[key] = t;
    }
    return changed ? result : obj;
  }
  return obj;
}

/**
 * Truncate large event data to bound memory usage per event.
 */
function createTruncator(maxStringSize: number) {
  if (maxStringSize <= 0) return (event: DashboardEvent) => event; // disabled
  return (event: DashboardEvent): DashboardEvent => {
    const data = event.data;
    if (!data || typeof data !== "object") return event;
    const truncated = truncateStrings(data, maxStringSize) as Record<string, unknown>;
    return truncated !== data ? { ...event, data: truncated } : event;
  };
}

export function createMemoryEventStore(
  isSessionPinned: (sessionId: string) => boolean,
  maxCachedSessions: number = DEFAULT_MAX_CACHED_SESSIONS,
  maxEventsPerSession: number = DEFAULT_MAX_EVENTS_PER_SESSION,
  maxStringFieldSize: number = DEFAULT_MAX_STRING_SIZE,
): EventStore {
  const truncateEventData = createTruncator(maxStringFieldSize);
  const buffers = new Map<string, SessionBuffer>();
  // Overshoot allowed before a reclaim pass runs. Scales to 0 for the tiny
  // caps used in unit tests (so they trim on every over-cap insert, exercising
  // the exact-cap behavior) and to 256 for the 20000 production cap (~1 pass
  // per 256 inserts). See change: preserve-chat-head-on-event-trim.
  const trimSlack = Math.min(256, Math.floor(maxEventsPerSession * 0.05));

  function getOrCreate(sessionId: string): SessionBuffer {
    let buf = buffers.get(sessionId);
    if (!buf) {
      buf = { events: [], nextSeq: 1, lastAccess: Date.now() };
      buffers.set(sessionId, buf);
    }
    buf.lastAccess = Date.now();
    return buf;
  }

  function evictIfNeeded(): void {
    if (buffers.size <= maxCachedSessions) return;

    // Collect evictable sessions sorted by lastAccess ascending
    const evictable: Array<[string, number]> = [];
    for (const [id, buf] of buffers) {
      if (!isSessionPinned(id)) {
        evictable.push([id, buf.lastAccess]);
      }
    }
    evictable.sort((a, b) => a[1] - b[1]);

    // Evict until we're at or below the limit
    let toEvict = buffers.size - maxCachedSessions;
    for (const [id] of evictable) {
      if (toEvict <= 0) break;
      buffers.delete(id);
      toEvict--;
    }
  }

  return {
    insertEvent(sessionId: string, event: DashboardEvent): number {
      const buf = getOrCreate(sessionId);
      const seq = buf.nextSeq++;
      buf.events.push({ seq, event: truncateEventData(event) });
      // Trim over the per-session limit (0 = unlimited). Hysteresis: only
      // reclaim once the buffer overshoots the cap by TRIM_SLACK, then trim
      // back to the cap in one O(n) pass. This amortizes the trim cost to O(1)
      // per insert (vs O(n) per insert if we trimmed on every over-cap insert)
      // — critical because the history-load path inserts every replayed event
      // through here in a loop, and subagent floods emit thousands at the cap.
      // The pass preserves the chat head (message_start/end) and drops the
      // oldest tool/subagent/flow noise first. See change:
      // preserve-chat-head-on-event-trim.
      if (
        maxEventsPerSession > 0 &&
        buf.events.length > maxEventsPerSession + trimSlack
      ) {
        trimBufferToLimit(buf, maxEventsPerSession);
      }
      evictIfNeeded();
      return seq;
    },

    getEvents(sessionId: string, minSeq: number): StoredEvent[] {
      const buf = buffers.get(sessionId);
      if (!buf) return [];
      buf.lastAccess = Date.now();
      const effectiveMin = minSeq > 0 ? minSeq : 1;
      return buf.events.filter((e) => e.seq >= effectiveMin);
    },

    getEvent(sessionId: string, seq: number): DashboardEvent | undefined {
      const buf = buffers.get(sessionId);
      if (!buf) return undefined;
      buf.lastAccess = Date.now();
      const entry = buf.events.find((e) => e.seq === seq);
      return entry?.event;
    },

    findToolEndEvent(sessionId: string, toolCallId: string): DashboardEvent | undefined {
      const buf = buffers.get(sessionId);
      if (!buf) return undefined;
      buf.lastAccess = Date.now();
      for (let i = buf.events.length - 1; i >= 0; i--) {
        const ev = buf.events[i].event;
        if (
          ev.eventType === "tool_execution_end" &&
          (ev.data as Record<string, unknown> | undefined)?.toolCallId === toolCallId
        ) {
          return ev;
        }
      }
      return undefined;
    },

    deleteEventsForSession(sessionId: string): number {
      const buf = buffers.get(sessionId);
      if (!buf) return 0;
      const count = buf.events.length;
      buffers.delete(sessionId);
      return count;
    },

    hasEvents(sessionId: string): boolean {
      const buf = buffers.get(sessionId);
      return buf !== undefined && buf.events.length > 0;
    },

    getMaxSeq(sessionId: string): number {
      const buf = buffers.get(sessionId);
      if (!buf || buf.events.length === 0) return 0;
      return buf.events[buf.events.length - 1].seq;
    },

    sessionCount(): number {
      return buffers.size;
    },
  };
}
