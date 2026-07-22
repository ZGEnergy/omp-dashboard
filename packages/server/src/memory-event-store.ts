/**
 * Bounded in-memory event store with generation-aware contiguous retention.
 */
import { randomUUID } from "node:crypto";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";

export interface StoredEvent { seq: number; event: DashboardEvent; }
export interface RetainedRange {
  retainedMinSeq: number | null;
  retainedMaxSeq: number | null;
  historyTruncated: boolean;
}
export interface StoredSource {
  sourceGeneration: string;
  events: StoredEvent[];
  range: RetainedRange;
}
export interface TrimStats {
  trimmedEvents: { total: number; toolExecutionEnd: number; bySession: Record<string, number> };
  evictedSessions: number;
}
export interface EventStore {
  insertEvent(sessionId: string, event: DashboardEvent): number;
  getEvents(sessionId: string, minSeq: number): StoredEvent[];
  getEvent(sessionId: string, seq: number): DashboardEvent | undefined;
  findToolEndEvent(sessionId: string, toolCallId: string): DashboardEvent | undefined;
  deleteEventsForSession(sessionId: string): number;
  hasEvents(sessionId: string): boolean;
  getMaxSeq(sessionId: string): number;
  getSourceGeneration(sessionId: string): string;
  getRetainedRange(sessionId: string): RetainedRange;
  replaceEvents(sessionId: string, events: DashboardEvent[]): StoredSource;
  sessionCount(): number;
  getTrimStats(): TrimStats;
  getTruncationLimits(): { maxStringFieldSize: number; maxEventDataSize: number };
}

interface SessionBuffer {
  events: StoredEvent[];
  nextSeq: number;
  revision: number;
  sourceGeneration: string;
  historyTruncated: boolean;
  lastAccess: number;
}

export const DEFAULT_MAX_CACHED_SESSIONS = 100;
export const DEFAULT_MAX_EVENTS_PER_SESSION = 20_000;
export const DEFAULT_MAX_STRING_SIZE = 4_000;
export const DEFAULT_MAX_EVENT_DATA_SIZE = 20_000;
const SKILL_ENVELOPE_RE = /^(<skill name="[^"]+" location="[^"]+">\n)([\s\S]*?)(\n<\/skill>)((?:\n\n[\s\S]+)?)$/;

function isImageBlock(value: object): boolean {
  return typeof (value as Record<string, unknown>).data === "string" && "mimeType" in value;
}
function capString(value: string, max: number): string {
  if (value.length <= max) return value;
  const skill = value.match(SKILL_ENVELOPE_RE);
  if (skill) {
    const [, head, body, tail, args] = skill;
    const budget = Math.max(0, max - head.length - tail.length - args.length);
    return `${head}${body.slice(0, budget)}\n…[truncated]${tail}${args}`;
  }
  return `${value.slice(0, max)}\n…[truncated]`;
}
type TruncateContext = "normal" | "assistant-content" | "assistant-text";

// A block whose text must never be capped: assistant prose (`type: "text"`) and
// reasoning/thinking blocks (`type: "thinking"` — real shape carries its text under
// either `.thinking` or `.text`, per replay-coordinator.ts `isToolOnlyAssistantMessage`;
// `"reasoning"` covered defensively though not observed in this codebase).
const PROTECTED_TEXT_BLOCK_TYPES = new Set(["text", "thinking", "reasoning"]);

function isAssistantTextBlock(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && PROTECTED_TEXT_BLOCK_TYPES.has((value as Record<string, unknown>).type as string);
}

function truncateStrings(value: unknown, max: number, depth = 0, context: TruncateContext = "normal"): unknown {
  if (depth > 4) {
    if (typeof value === "string") return context === "assistant-text" ? value : capString(value, max);
    if (value && typeof value === "object" && !Array.isArray(value) && isImageBlock(value)) return value;
    return value && typeof value === "object" ? "[truncated: deep]" : value;
  }
  if (typeof value === "string") return context === "assistant-text" ? value : capString(value, max);
  if (Array.isArray(value)) {
    if (value.length > 20) return "[array truncated]";
    let changed = false;
    const result = value.map((child) => {
      const childContext = context === "assistant-content" && isAssistantTextBlock(child) ? "assistant-text" : "normal";
      const next = truncateStrings(child, max, depth + 1, childContext);
      changed ||= next !== child;
      return next;
    });
    return changed ? result : value;
  }
  if (!value || typeof value !== "object") return value;
  let changed = false;
  const result: Record<string, unknown> = {};
  const role = (value as Record<string, unknown>).role;
  const isProtectedMessageRole = role === "assistant" || role === "user";
  for (const [key, child] of Object.entries(value)) {
    if (key === "data" && typeof child === "string" && "mimeType" in value) { result[key] = child; continue; }
    const childContext: TruncateContext = context === "assistant-text"
      ? key === "text" || key === "thinking" ? "assistant-text" : "normal"
      : isProtectedMessageRole && key === "content"
        ? typeof child === "string" ? "assistant-text" : "assistant-content"
        : "normal";
    const next = truncateStrings(child, max, depth + 1, childContext);
    changed ||= next !== child;
    result[key] = next;
  }
  return changed ? result : value;
}

interface SizeWalk { total: number; cap: number; seen: WeakSet<object>; }
function walkSize(value: unknown, state: SizeWalk): boolean {
  if (state.total > state.cap) return true;
  if (typeof value === "string") { state.total += value.length + 2; return state.total > state.cap; }
  if (typeof value === "number" || typeof value === "boolean") { state.total += 8; return state.total > state.cap; }
  if (value == null) { state.total += value === null ? 4 : 0; return state.total > state.cap; }
  if (typeof value !== "object") return false;
  if (state.seen.has(value)) { state.total += 2; return state.total > state.cap; }
  state.seen.add(value);
  if (Array.isArray(value)) {
    state.total += 2;
    for (const child of value) { if (walkSize(child, state)) return true; state.total += 1; }
    return state.total > state.cap;
  }
  state.total += 2;
  const image = isImageBlock(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    state.total += key.length + 3;
    if (state.total > state.cap) return true;
    const child = (value as Record<string, unknown>)[key];
    if (image && key === "data" && typeof child === "string") state.total += 8;
    else if (walkSize(child, state)) return true;
    state.total += 1;
  }
  return state.total > state.cap;
}
export function exceedsSerializedSize(value: unknown, cap: number): boolean {
  return walkSize(value, { total: 0, cap, seen: new WeakSet<object>() });
}
function pickSmallScalars(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "number" || typeof child === "boolean" || (typeof child === "string" && child.length <= 512)) out[key] = child;
  }
  return out;
}
function isProtectedContentBlockArray(content: unknown): boolean {
  return Array.isArray(content) && content.some((block) => isAssistantTextBlock(block));
}

/**
 * True when `data` carries a message (assistant/user, or a reasoning/thinking
 * block) whose content is a hard-invariant-protected string. Detected from the
 * event's own message shape — never from byte size — so the whole-event
 * scalar-collapse below can be skipped without ever nuking protected text.
 */
function isProtectedMessageEvent(data: Record<string, unknown>): boolean {
  const message = data.message as Record<string, unknown> | undefined;
  if (!message || typeof message !== "object") return false;
  const role = message.role;
  if (role !== "assistant" && role !== "user") return false;
  const content = message.content;
  return typeof content === "string" || isProtectedContentBlockArray(content);
}

export function truncateEvent(event: DashboardEvent, maxString: number, maxData: number): DashboardEvent {
  if (!event.data || typeof event.data !== "object") return event;
  const data = truncateStrings(event.data, maxString) as Record<string, unknown>;
  // Protected message events (assistant text, reasoning/thinking, user text) skip the
  // whole-event scalar collapse below: `truncateStrings` above already preserved their
  // content uncapped, but the byte-blind `pickSmallScalars` collapse would otherwise
  // drop that content entirely just because the event's total size exceeds `maxData`.
  // Tool events (tool_execution_*) are never message events, so they keep the
  // existing collapse behavior unchanged.
  if (maxData > 0 && !isProtectedMessageEvent(data) && exceedsSerializedSize(data, maxData)) {
    return { ...event, data: { ...pickSmallScalars(data), __truncated: true, reason: "event data exceeded MAX_EVENT_DATA_SIZE", thresholdBytes: maxData, eventType: event.eventType } };
  }
  return data === event.data ? event : { ...event, data };
}

export function createMemoryEventStore(
  isSessionPinned: (sessionId: string) => boolean,
  maxCachedSessions = DEFAULT_MAX_CACHED_SESSIONS,
  maxEventsPerSession = DEFAULT_MAX_EVENTS_PER_SESSION,
  maxStringFieldSize = DEFAULT_MAX_STRING_SIZE,
  maxEventDataSize = DEFAULT_MAX_EVENT_DATA_SIZE,
  serverEpoch = randomUUID(),
): EventStore {
  const stringFieldLimit = Number.isFinite(maxStringFieldSize) && maxStringFieldSize > 0 ? maxStringFieldSize : DEFAULT_MAX_STRING_SIZE;
  const buffers = new Map<string, SessionBuffer>();
  // Retain revisions independently of evictable event buffers. A cache miss must
  // never recreate an earlier source authority for the same session id.
  const revisions = new Map<string, number>();
  let trimmedTotal = 0;
  let trimmedToolEnd = 0;
  let evictedTotal = 0;
  const trimmedBySession = new Map<string, number>();

  const generation = (revision: number) => `${serverEpoch}:${revision}`;
  const newBuffer = (revision = 0): SessionBuffer => ({ events: [], nextSeq: 1, revision, sourceGeneration: generation(revision), historyTruncated: false, lastAccess: Date.now() });
  function getOrCreate(sessionId: string): SessionBuffer {
    let buffer = buffers.get(sessionId);
    if (!buffer) {
      const revision = revisions.get(sessionId) ?? 0;
      buffer = newBuffer(revision);
      buffers.set(sessionId, buffer);
      revisions.set(sessionId, revision);
    }
    buffer.lastAccess = Date.now();
    return buffer;
  }
  function evictIfNeeded(): void {
    if (buffers.size <= maxCachedSessions) return;
    const candidates = [...buffers.entries()].filter(([id]) => !isSessionPinned(id)).sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    let count = buffers.size - maxCachedSessions;
    for (const [id, buffer] of candidates) {
      if (count-- <= 0) break;
      buffers.delete(id);
      revisions.set(id, buffer.revision + 1);
      trimmedBySession.delete(id);
      evictedTotal++;
    }
  }
  function trim(buffer: SessionBuffer, sessionId: string): void {
    if (maxEventsPerSession <= 0) return;
    const trimSlack = Math.min(256, Math.floor(maxEventsPerSession * 0.05));
    if (buffer.events.length <= maxEventsPerSession + trimSlack) return;

    let remainingDrops = buffer.events.length - maxEventsPerSession;
    const removed: StoredEvent[] = [];
    const retained: StoredEvent[] = [];
    for (const entry of buffer.events) {
      const essential = entry.event.eventType === "message_start" || entry.event.eventType === "message_end";
      if (!essential && remainingDrops > 0) {
        removed.push(entry);
        remainingDrops--;
      } else {
        retained.push(entry);
      }
    }
    if (remainingDrops > 0) removed.push(...retained.splice(0, remainingDrops));

    buffer.events = retained;
    buffer.historyTruncated = true;
    trimmedTotal += removed.length;
    const toolEnds = removed.filter((entry) => entry.event.eventType === "tool_execution_end").length;
    trimmedToolEnd += toolEnds;
    trimmedBySession.set(sessionId, (trimmedBySession.get(sessionId) ?? 0) + removed.length);
  }

  return {
    insertEvent(sessionId, event) {
      const buffer = getOrCreate(sessionId);
      const seq = buffer.nextSeq++;
      buffer.events.push({ seq, event: truncateEvent(event, stringFieldLimit, maxEventDataSize) });
      trim(buffer, sessionId);
      evictIfNeeded();
      return seq;
    },
    getEvents(sessionId, minSeq) {
      const buffer = buffers.get(sessionId);
      if (!buffer) return [];
      buffer.lastAccess = Date.now();
      const min = minSeq > 0 ? minSeq : 1;
      return buffer.events.filter((entry) => entry.seq >= min);
    },
    getEvent(sessionId, seq) {
      const buffer = buffers.get(sessionId);
      if (!buffer) return undefined;
      buffer.lastAccess = Date.now();
      return buffer.events.find((entry) => entry.seq === seq)?.event;
    },
    findToolEndEvent(sessionId, toolCallId) {
      const buffer = buffers.get(sessionId);
      if (!buffer) return undefined;
      buffer.lastAccess = Date.now();
      for (let index = buffer.events.length - 1; index >= 0; index--) {
        const entry = buffer.events[index]!;
        if (entry.event.eventType === "tool_execution_end" && (entry.event.data as Record<string, unknown> | undefined)?.toolCallId === toolCallId) return entry.event;
      }
      return undefined;
    },
    deleteEventsForSession(sessionId) {
      const buffer = buffers.get(sessionId);
      if (!buffer) return 0;
      const count = buffer.events.length;
      const nextRevision = buffer.revision + 1;
      const next = newBuffer(nextRevision);
      buffers.set(sessionId, next);
      revisions.set(sessionId, nextRevision);
      trimmedBySession.delete(sessionId);
      return count;
    },
    replaceEvents(sessionId, events) {
      const previous = buffers.get(sessionId);
      const revision = Math.max(previous?.revision ?? -1, revisions.get(sessionId) ?? 0) + 1;
      const buffer = newBuffer(revision);
      buffer.events = events.map((event, index) => ({ seq: index + 1, event: truncateEvent(event, stringFieldLimit, maxEventDataSize) }));
      buffer.nextSeq = buffer.events.length + 1;
      trim(buffer, sessionId);
      buffer.lastAccess = Date.now();
      buffers.set(sessionId, buffer);
      revisions.set(sessionId, revision);
      trimmedBySession.delete(sessionId);
      evictIfNeeded();
      return { sourceGeneration: buffer.sourceGeneration, events: buffer.events.slice(), range: { retainedMinSeq: buffer.events[0]?.seq ?? null, retainedMaxSeq: buffer.events.at(-1)?.seq ?? null, historyTruncated: buffer.historyTruncated } };
    },
    hasEvents(sessionId) { return (buffers.get(sessionId)?.events.length ?? 0) > 0; },
    getMaxSeq(sessionId) { return buffers.get(sessionId)?.events.at(-1)?.seq ?? 0; },
    getSourceGeneration(sessionId) { return buffers.get(sessionId)?.sourceGeneration ?? generation(revisions.get(sessionId) ?? 0); },
    getRetainedRange(sessionId) {
      const buffer = buffers.get(sessionId);
      return { retainedMinSeq: buffer?.events[0]?.seq ?? null, retainedMaxSeq: buffer?.events.at(-1)?.seq ?? null, historyTruncated: buffer?.historyTruncated ?? false };
    },
    sessionCount() { return buffers.size; },
    getTrimStats() { return { trimmedEvents: { total: trimmedTotal, toolExecutionEnd: trimmedToolEnd, bySession: Object.fromEntries(trimmedBySession) }, evictedSessions: evictedTotal }; },
    getTruncationLimits() { return { maxStringFieldSize: stringFieldLimit, maxEventDataSize }; },
  };
}
