import type {
  EventReplayMessage,
  ReplayKind,
  SkippedSeqRange,
} from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { estimateSeqEventBytes } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import {
  clipSkippedSeqRanges,
  computeLogicalSeqBounds,
  normalizeSkippedSeqRanges,
  retainSkippedSeqRangesForEventSuffix,
} from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { DEFAULT_REPLAY_RETENTION_BYTES } from "./replay-retention.js";

export interface LedgerEvent {
  seq: number;
  event: DashboardEvent;
}

export interface ReplayRequest {
  requestId: string;
  kind: ReplayKind;
  sourceGeneration: string;
  fromSeq?: number;
  anchorToken?: string;
}

export type LedgerResetReason = "conflict" | "gap_overflow" | "invalid_replay" | "terminal_gap";
export type LedgerStatus = "cold" | "ready" | "retry";

export interface LedgerAdmission {
  accepted: LedgerEvent[];
  stale: boolean;
  reset: LedgerResetReason | null;
  repair: { kind: "delta"; cursor: number } | null;
  rebuild: boolean;
  /** Oldest retained rows were evicted to keep the hot transcript bounded. */
  evictedHead: boolean;
  /** The ledger's retained floor after this admission's trim. */
  minSeq: number;
}

export interface SessionReplayLedgerOptions {
  maxGapEvents?: number;
  maxGapBytes?: number;
  /** Max UTF-8 bytes retained in the hot transcript. */
  maxRetainedBytes?: number;
}

const DEFAULT_MAX_GAP_EVENTS = 256;
const DEFAULT_MAX_GAP_BYTES = 1024 * 1024;

type TimelineItem =
  | { kind: "exact"; start: number; end: number; event: LedgerEvent }
  | { kind: "range"; start: number; end: number; range: SkippedSeqRange };

/**
 * The only owner of a session's sequence range and replay request authority.
 * Reducers only consume `accepted`; a gap therefore cannot accidentally advance
 * a rendered cursor or persistence buffer.
 */
export class SessionReplayLedger {
  private readonly bySeq = new Map<number, LedgerEvent>();
  private skippedRanges: SkippedSeqRange[] = [];
  private readonly gaps = new Map<number, LedgerEvent>();
  private active: ReplayRequest | null = null;
  private activeSource: string | null = null;
  private gapBytes = 0;
  private retainedBytes = 0;
  private repairLatched = false;
  private completion: { requestId: string; anchorToken?: string } | null = null;
  /** Highest sequence admitted for the current ascending older-page stream. */
  private olderPageLastSeq: number | null = null;
  private failures = new Map<ReplayKind, number>();
  private readonly maxGapEvents: number;
  private readonly maxGapBytes: number;
  private maxRetainedBytes: number;
  status: LedgerStatus = "cold";

  constructor(readonly sessionId: string, options: SessionReplayLedgerOptions = {}) {
    this.maxGapEvents = options.maxGapEvents ?? DEFAULT_MAX_GAP_EVENTS;
    this.maxGapBytes = options.maxGapBytes ?? DEFAULT_MAX_GAP_BYTES;
    this.maxRetainedBytes = options.maxRetainedBytes ?? DEFAULT_REPLAY_RETENTION_BYTES;
  }

  get sourceGeneration(): string | null {
    return this.activeSource;
  }
  get cursor(): number {
    return computeLogicalSeqBounds(this.events, this.skippedRanges).maxSeq ?? 0;
  }

  get minSeq(): number {
    return computeLogicalSeqBounds(this.events, this.skippedRanges).minSeq ?? 0;
  }

  get retainedByteCount(): number {
    const skippedBytes = this.skippedRanges.length > 0 ? JSON.stringify(this.skippedRanges).length : 0;
    return this.retainedBytes + skippedBytes;
  }

  get events(): LedgerEvent[] {
    return [...this.bySeq.values()].sort((a, b) => a.seq - b.seq);
  }

  get skippedSeqRanges(): SkippedSeqRange[] {
    return [...this.skippedRanges];
  }

  get request(): ReplayRequest | null {
    return this.active;
  }

  begin(request: ReplayRequest): void {
    if (this.activeSource !== null && this.activeSource !== request.sourceGeneration) {
      this.clear(request.sourceGeneration);
    } else if (this.activeSource === null) {
      this.activeSource = request.sourceGeneration;
    } else if (request.kind === "cold") {
      // A cold retry is a new canonical baseline, never an append to the old one.
      // Keep the per-kind failure count so the second timeout reaches retry state.
      this.clear(request.sourceGeneration, false);
    }
    this.active = request;
    this.olderPageLastSeq = null;
    this.status = "cold";
  }

  /** Cancel the active request so a late terminal frame cannot mutate state. */
  cancel(requestId?: string): void {
    if (requestId !== undefined && this.active?.requestId !== requestId) return;
    this.active = null;
    this.gaps.clear();
    this.gapBytes = 0;
    this.repairLatched = false;
    this.completion = null;
    this.olderPageLastSeq = null;
    this.status = "retry";
  }

  reset(sourceGeneration: string): void {
    this.clear(sourceGeneration);
    this.active = null;
    this.status = "cold";
  }

  /**
   * Lift or lower the retained-bytes cap at runtime. Raising (e.g. to
   * `Infinity` while the user reads older history) never prunes; lowering back
   * to the base ceiling flushes the oldest events to the new budget. Returns
   * whether the head was evicted so the caller can prune the reducer to match.
   */
  setMaxRetainedBytes(bytes: number): boolean {
    this.maxRetainedBytes = bytes;
    return this.trimRetained();
  }

  /** Seed a cache-admitted nonempty contiguous suffix before issuing its delta request. */
  seed(
    sourceGeneration: string,
    entries: readonly LedgerEvent[],
    skippedRanges: readonly SkippedSeqRange[] = [],
  ): boolean {
    const normRanges = normalizeSkippedSeqRanges(skippedRanges);
    if (entries.length === 0 && normRanges.length === 0) return false;
    if (!this.isStrictlyAscending(entries)) return false;

    // Build timeline items to check contiguity
    const items: TimelineItem[] = [
      ...entries.map((e): TimelineItem => ({ kind: "exact", start: e.seq, end: e.seq, event: e })),
      ...normRanges.map((r): TimelineItem => ({ kind: "range", start: r.fromSeq, end: r.toSeq, range: r })),
    ].sort((a, b) => a.start - b.start);

    for (let i = 1; i < items.length; i++) {
      if (items[i].start <= items[i - 1].end || items[i].start !== items[i - 1].end + 1) return false;
    }

    const entrySeqs = entries.map((e) => e.seq);
    if (rangeOverlapsSeqs(normRanges, entrySeqs)) return false;

    this.clear(sourceGeneration);
    this.active = null;
    for (const entry of entries) this.addRetained(entry);
    this.skippedRanges = normRanges;
    this.trimRetained();
    this.status = "ready";
    return true;
  }

  /** A timeout/reducer failure is retryable exactly once per request kind/source. */
  fail(kind: ReplayKind): "retry" | "retry_state" {
    const failures = (this.failures.get(kind) ?? 0) + 1;
    this.failures.set(kind, failures);
    if (failures > 1) {
      this.status = "retry";
      return "retry_state";
    }
    return "retry";
  }

  takeOlderCompletion(): { requestId: string; anchorToken?: string } | null {
    const completion = this.completion;
    this.completion = null;
    return completion;
  }

  admit(frame: EventReplayMessage): LedgerAdmission {
    const result = this.empty();
    if (frame.sessionId !== this.sessionId || !this.active ||
      frame.requestId !== this.active.requestId ||
      frame.replayKind !== this.active.kind) {
      result.stale = true;
      return result;
    }
    // The very first cold request has no source generation before the server's
    // correlated first frame. Adopt it only while no canonical event exists;
    // every later frame remains an exact source-generation match.
    const adoptingInitialColdSource = this.activeSource === "" && this.active.kind === "cold" &&
      this.bySeq.size === 0 && this.skippedRanges.length === 0 && frame.replayKind === "cold";
    if (adoptingInitialColdSource) {
      this.activeSource = frame.sourceGeneration;
      this.active.sourceGeneration = frame.sourceGeneration;
    } else if (frame.sourceGeneration !== this.activeSource) {
      result.stale = true;
      return result;
    }
    const originalMin = this.minSeq;
    const events = frame.events ?? [];
    const frameRanges = normalizeSkippedSeqRanges(frame.skippedSeqRanges ?? []);

    const hasBaseline = this.bySeq.size > 0 || this.skippedRanges.length > 0;
    if (!this.isStrictlyAscending(events)) {
      if (!hasBaseline) return this.resetResult("invalid_replay");
      result.stale = true;
      return result;
    }

    // Overlap check between events and skipped ranges in this frame
    const eventSeqs = events.map((e) => e.seq);
    if (rangeOverlapsSeqs(frameRanges, eventSeqs)) {
      if (!hasBaseline) return this.resetResult("invalid_replay");
      result.stale = true;
      return result;
    }

    if (frame.replayKind === "cold" && !hasBaseline) {
      const outcome = this.acceptForwardFrame(events, frameRanges, result);
      if (outcome === "conflict") return this.resetResult("conflict");
      if (outcome === "invalid_replay") return this.resetResult("invalid_replay");
    } else if (frame.replayKind === "older") {
      if (!this.acceptOlder(events, frameRanges, originalMin, result, frame.isLast)) {
        if (!hasBaseline) return this.resetResult("invalid_replay");
        result.stale = true;
        return result;
      }
    } else {
      const outcome = this.acceptForwardFrame(events, frameRanges, result);
      if (outcome === "conflict") return this.resetResult("conflict");
      if (outcome === "invalid_replay") {
        if (!hasBaseline) return this.resetResult("invalid_replay");
        result.stale = true;
        return result;
      }
    }

    result.evictedHead = this.trimRetained();

    if (frame.isLast) {
      const completed = this.active;
      if (frame.replayKind === "delta" && this.gaps.size > 0) return this.resetResult("terminal_gap");
      this.active = null;
      this.status = "ready";
      this.failures.delete(frame.replayKind);
      if (frame.replayKind === "older") {
        this.completion = { requestId: frame.requestId!, anchorToken: completed?.anchorToken };
        result.rebuild = true;
      }
    }
    result.minSeq = this.minSeq;
    return result;
  }

  admitLive(entry: LedgerEvent): LedgerAdmission {
    const result = this.empty();
    if (this.activeSource === null || this.status === "retry") {
      result.stale = true;
      return result;
    }
    if (this.isCoveredBySkipped(entry.seq)) return result;
    const admission = this.acceptForward(entry);
    if (admission === "conflict") return this.resetResult("conflict");
    if (admission === "accepted") {
      result.accepted.push(entry);
      this.drainGaps(result.accepted);
      result.evictedHead = this.trimRetained();
      result.minSeq = this.minSeq;
      return result;
    }
    if (admission === "duplicate") return result;
    this.gaps.set(entry.seq, entry);
    this.gapBytes += JSON.stringify(entry).length;
    if (this.gaps.size > this.maxGapEvents || this.gapBytes > this.maxGapBytes) return this.resetResult("gap_overflow");
    if (!this.repairLatched) {
      this.repairLatched = true;
      result.repair = { kind: "delta", cursor: this.cursor };
    }
    return result;
  }

  private acceptOlder(
    events: LedgerEvent[],
    frameRanges: SkippedSeqRange[],
    originalMin: number,
    result: LedgerAdmission,
    terminal: boolean,
  ): boolean {
    const boundary = this.active?.fromSeq ?? originalMin;
    if (boundary <= 0) return false;
    const count = events.length + frameRanges.length;
    if (count > 0) {
      const items: TimelineItem[] = [
        ...events.map((e): TimelineItem => ({ kind: "exact", start: e.seq, end: e.seq, event: e })),
        ...frameRanges.map((r): TimelineItem => ({ kind: "range", start: r.fromSeq, end: r.toSeq, range: r })),
      ].sort((a, b) => a.start - b.start);

      for (let i = 1; i < items.length; i++) {
        if (items[i].start <= items[i - 1].end || items[i].start !== items[i - 1].end + 1) return false;
      }

      const maxSeq = items[items.length - 1].end;
      const minSeq = items[0].start;

      if (maxSeq >= boundary) return false;
      if (this.olderPageLastSeq !== null && minSeq !== this.olderPageLastSeq + 1) return false;

      const eventSeqs = events.map((e) => e.seq);
      if (rangeOverlapsSeqs(frameRanges, eventSeqs)) return false;

      for (const entry of events) {
        if (this.isCoveredBySkipped(entry.seq)) return false;
        const old = this.bySeq.get(entry.seq);
        if (old && !sameEvent(old, entry)) return false;
      }

      const retainedSeqs = this.events.map((e) => e.seq);
      if (rangeOverlapsSeqs(frameRanges, retainedSeqs)) return false;
      if (rangesOverlapRanges(frameRanges, this.skippedRanges)) return false;

      for (const entry of events) {
        if (!this.bySeq.has(entry.seq)) {
          this.addRetained(entry);
          result.accepted.push(entry);
        }
      }
      this.addSkippedRanges(frameRanges);
      this.olderPageLastSeq = maxSeq;
    }
    return !terminal || this.olderPageLastSeq === boundary - 1;
  }

  private acceptForwardFrame(
    events: LedgerEvent[],
    frameRanges: SkippedSeqRange[],
    result: LedgerAdmission,
  ): "accepted" | "conflict" | "invalid_replay" {
    if (events.length === 0 && frameRanges.length === 0) return "accepted";

    const eventSeqs = events.map((e) => e.seq);
    if (rangeOverlapsSeqs(frameRanges, eventSeqs)) return "invalid_replay";

    // Overlap checks against existing retained state & skipped ranges
    const retainedSeqs = this.events.map((e) => e.seq);
    if (rangeOverlapsSeqs(frameRanges, retainedSeqs)) return "invalid_replay";

    if (rangesOverlapRanges(frameRanges, this.skippedRanges)) return "invalid_replay";

    // Construct timeline items
    const items: TimelineItem[] = [
      ...events.map((e): TimelineItem => ({ kind: "exact", start: e.seq, end: e.seq, event: e })),
      ...frameRanges.map((r): TimelineItem => ({ kind: "range", start: r.fromSeq, end: r.toSeq, range: r })),
    ].sort((a, b) => a.start - b.start);

    // Validate internal contiguity of frame items
    for (let i = 1; i < items.length; i++) {
      if (items[i].start <= items[i - 1].end || items[i].start !== items[i - 1].end + 1) return "invalid_replay";
    }

    const cursor = this.cursor;

    // Check connection to current cursor
    if (items[0].start > cursor) {
      const connectsToCursor = cursor === 0 || items[0].start === cursor + 1 || this.gaps.has(items[0].start);
      if (!connectsToCursor) return "invalid_replay";
    }

    // Pre-validate conflicts for exact events before state mutation
    for (const item of items) {
      if (item.kind === "exact") {
        const old = this.bySeq.get(item.event.seq);
        if (old && !sameEvent(old, item.event)) return "conflict";
        const buffered = this.gaps.get(item.event.seq);
        if (buffered && !sameEvent(buffered, item.event)) return "conflict";
      }
    }

    // Apply items in ascending order
    for (const item of items) {
      if (item.kind === "range") {
        for (const [seq, gapEntry] of [...this.gaps.entries()]) {
          if (seq >= item.start && seq <= item.end) {
            this.gaps.delete(seq);
            this.gapBytes -= JSON.stringify(gapEntry).length;
          }
        }
        if (item.end > cursor) {
          const newRange: SkippedSeqRange = {
            fromSeq: Math.max(item.start, cursor + 1),
            toSeq: item.end,
          };
          this.addSkippedRanges([newRange]);
        }
      } else {
        const entry = item.event;
        if (this.gaps.has(entry.seq)) {
          this.gaps.delete(entry.seq);
          this.gapBytes -= JSON.stringify(entry).length;
          this.addRetained(entry);
          result.accepted.push(entry);
        } else if (entry.seq > cursor) {
          const admission = this.acceptForward(entry);
          if (admission === "conflict") return "conflict";
          if (admission === "gap") return "invalid_replay";
          if (admission === "accepted") result.accepted.push(entry);
        } else {
          // entry.seq <= cursor
          if (this.isCoveredBySkipped(entry.seq)) continue;
          const old = this.bySeq.get(entry.seq);
          if (old) {
            if (!sameEvent(old, entry)) return "conflict";
            continue;
          }
          return "invalid_replay";
        }
      }
    }

    this.drainGaps(result.accepted);
    return "accepted";
  }

  private acceptForward(entry: LedgerEvent): "accepted" | "duplicate" | "conflict" | "gap" {
    if (this.isCoveredBySkipped(entry.seq)) return "duplicate";
    const old = this.bySeq.get(entry.seq);
    if (old) return sameEvent(old, entry) ? "duplicate" : "conflict";
    const buffered = this.gaps.get(entry.seq);
    if (buffered) return sameEvent(buffered, entry) ? "duplicate" : "conflict";
    const cursor = this.cursor;
    if (cursor === 0 || entry.seq === cursor + 1) {
      this.addRetained(entry);
      return "accepted";
    }
    return "gap";
  }

  private isCoveredBySkipped(seq: number): boolean {
    let low = 0;
    let high = this.skippedRanges.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const r = this.skippedRanges[mid]!;
      if (seq >= r.fromSeq && seq <= r.toSeq) return true;
      if (seq < r.fromSeq) high = mid - 1;
      else low = mid + 1;
    }
    return false;
  }

  private addSkippedRanges(ranges: readonly SkippedSeqRange[]): void {
    if (ranges.length === 0) return;
    this.skippedRanges = normalizeSkippedSeqRanges([...this.skippedRanges, ...ranges]);
  }

  private drainGaps(accepted: LedgerEvent[]): void {
    while (true) {
      const entry = this.gaps.get(this.cursor + 1);
      if (!entry) break;
      this.gaps.delete(entry.seq);
      this.gapBytes -= JSON.stringify(entry).length;
      this.addRetained(entry);
      accepted.push(entry);
    }
    if (this.gaps.size === 0) this.repairLatched = false;
  }

  private addRetained(entry: LedgerEvent): void {
    this.bySeq.set(entry.seq, entry);
    this.retainedBytes += estimateSeqEventBytes(entry);
  }

  private trimRetained(): boolean {
    let evicted = false;
    while (this.bySeq.size > 1 && this.retainedByteCount > this.maxRetainedBytes) {
      let oldestSeq = Number.POSITIVE_INFINITY;
      for (const seq of this.bySeq.keys()) oldestSeq = Math.min(oldestSeq, seq);
      const oldest = this.bySeq.get(oldestSeq);
      if (!oldest) break;
      this.bySeq.delete(oldestSeq);
      this.retainedBytes -= estimateSeqEventBytes(oldest);
      evicted = true;
      this.skippedRanges = retainSkippedSeqRangesForEventSuffix(this.events, this.skippedRanges);
    }
    if (evicted) {
      this.skippedRanges = retainSkippedSeqRangesForEventSuffix(this.events, this.skippedRanges);
    }
    return evicted;
  }
  private isStrictlyAscending(events: readonly LedgerEvent[]): boolean {
    for (let index = 1; index < events.length; index++) {
      if (events[index - 1]!.seq >= events[index]!.seq) return false;
    }
    return true;
  }

  private clear(sourceGeneration: string, clearFailures = true): void {
    this.bySeq.clear();
    this.skippedRanges = [];
    this.gaps.clear();
    this.gapBytes = 0;
    this.retainedBytes = 0;
    this.repairLatched = false;
    this.completion = null;
    this.olderPageLastSeq = null;
    if (clearFailures) this.failures.clear();
    this.activeSource = sourceGeneration;
  }

  private empty(): LedgerAdmission {
    return {
      accepted: [],
      stale: false,
      reset: null,
      repair: null,
      rebuild: false,
      evictedHead: false,
      minSeq: this.minSeq,
    };
  }

  private resetResult(reason: LedgerResetReason): LedgerAdmission {
    this.bySeq.clear();
    this.skippedRanges = [];
    this.gaps.clear();
    this.gapBytes = 0;
    this.retainedBytes = 0;
    this.repairLatched = false;
    this.completion = null;
    this.olderPageLastSeq = null;
    this.active = null;
    this.status = "cold";
    return {
      accepted: [],
      stale: false,
      reset: reason,
      repair: null,
      rebuild: false,
      evictedHead: false,
      minSeq: 0,
    };
  }
}

function sameEvent(a: LedgerEvent, b: LedgerEvent): boolean {
  return JSON.stringify(a.event) === JSON.stringify(b.event);
}

function rangeOverlapsSeqs(ranges: readonly SkippedSeqRange[], sortedSeqs: readonly number[]): boolean {
  if (ranges.length === 0 || sortedSeqs.length === 0) return false;
  for (const r of ranges) {
    let low = 0;
    let high = sortedSeqs.length - 1;
    let idx = sortedSeqs.length;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (sortedSeqs[mid]! >= r.fromSeq) {
        idx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    if (idx < sortedSeqs.length && sortedSeqs[idx]! <= r.toSeq) {
      return true;
    }
  }
  return false;
}

function rangesOverlapRanges(rangesA: readonly SkippedSeqRange[], rangesB: readonly SkippedSeqRange[]): boolean {
  let i = 0;
  let j = 0;
  while (i < rangesA.length && j < rangesB.length) {
    const a = rangesA[i]!;
    const b = rangesB[j]!;
    if (Math.max(a.fromSeq, b.fromSeq) <= Math.min(a.toSeq, b.toSeq)) {
      return true;
    }
    if (a.toSeq < b.toSeq) i++;
    else j++;
  }
  return false;
}
