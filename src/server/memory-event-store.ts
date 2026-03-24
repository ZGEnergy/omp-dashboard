/**
 * In-memory event store with LRU eviction.
 * Replaces SQLite-backed event-store.ts.
 */
import type { DashboardEvent } from "../shared/types.js";

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
  /** Delete all events for a specific session */
  deleteEventsForSession(sessionId: string): number;
  /** Check if session has events in memory */
  hasEvents(sessionId: string): boolean;
  /** Number of cached sessions */
  sessionCount(): number;
}

interface SessionBuffer {
  events: StoredEvent[];
  nextSeq: number;
  lastAccess: number;
}

export const DEFAULT_MAX_CACHED_SESSIONS = 100;

export function createMemoryEventStore(
  isSessionPinned: (sessionId: string) => boolean,
  maxCachedSessions: number = DEFAULT_MAX_CACHED_SESSIONS,
): EventStore {
  const buffers = new Map<string, SessionBuffer>();

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
      buf.events.push({ seq, event });
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

    sessionCount(): number {
      return buffers.size;
    },
  };
}
