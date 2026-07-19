import type {
  EventReplayMessage,
  ReplayKind,
} from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";

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
}

export interface SessionReplayLedgerOptions {
  maxGapEvents?: number;
  maxGapBytes?: number;
}

const DEFAULT_MAX_GAP_EVENTS = 256;
const DEFAULT_MAX_GAP_BYTES = 1024 * 1024;

/**
 * The only owner of a session's sequence range and replay request authority.
 * Reducers only consume `accepted`; a gap therefore cannot accidentally advance
 * a rendered cursor or persistence buffer.
 */
export class SessionReplayLedger {
  private readonly bySeq = new Map<number, LedgerEvent>();
  private readonly gaps = new Map<number, LedgerEvent>();
  private active: ReplayRequest | null = null;
  private activeSource: string | null = null;
  private gapBytes = 0;
  private repairLatched = false;
  private completion: { requestId: string; anchorToken?: string } | null = null;
  private failures = new Map<ReplayKind, number>();
  private readonly maxGapEvents: number;
  private readonly maxGapBytes: number;
  status: LedgerStatus = "cold";

  constructor(readonly sessionId: string, options: SessionReplayLedgerOptions = {}) {
    this.maxGapEvents = options.maxGapEvents ?? DEFAULT_MAX_GAP_EVENTS;
    this.maxGapBytes = options.maxGapBytes ?? DEFAULT_MAX_GAP_BYTES;
  }

  get sourceGeneration(): string | null {
    return this.activeSource;
  }

  get cursor(): number {
    return this.events.at(-1)?.seq ?? 0;
  }

  get minSeq(): number {
    return this.events[0]?.seq ?? 0;
  }

  get events(): LedgerEvent[] {
    return [...this.bySeq.values()].sort((a, b) => a.seq - b.seq);
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
    this.status = "retry";
  }

  reset(sourceGeneration: string): void {
    this.clear(sourceGeneration);
    this.active = null;
    this.status = "cold";
  }

  /** Seed a cache-admitted nonempty contiguous suffix before issuing its delta request. */
  seed(sourceGeneration: string, entries: readonly LedgerEvent[]): boolean {
    if (entries.length === 0 || !this.isStrictlyAscending(entries) || !this.isContiguous(entries)) return false;
    this.clear(sourceGeneration);
    this.active = null;
    for (const entry of entries) this.bySeq.set(entry.seq, entry);
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
      this.bySeq.size === 0 && frame.replayKind === "cold";
    if (adoptingInitialColdSource) {
      this.activeSource = frame.sourceGeneration;
      this.active.sourceGeneration = frame.sourceGeneration;
    } else if (frame.sourceGeneration !== this.activeSource) {
      result.stale = true;
      return result;
    }
    const originalMin = this.minSeq;
    const events = frame.events;
    if (!this.isStrictlyAscending(events)) return this.resetResult("invalid_replay");

    if (frame.replayKind === "cold" && this.bySeq.size === 0 && events.length > 0) {
      // A tail cold frame establishes an explicit contiguous baseline, even when
      // retention means its first sequence is not one. Internal holes are never
      // a valid baseline, regardless of the retained starting sequence.
      if (!this.isContiguous(events)) return this.resetResult("invalid_replay");
      for (const entry of events) this.bySeq.set(entry.seq, entry);
      result.accepted = events;
    } else if (frame.replayKind === "older") {
      if (!this.acceptOlder(events, originalMin, result, frame.isLast)) return this.resetResult("invalid_replay");
    } else {
      for (const entry of events) {
        const admission = this.acceptForward(entry);
        if (admission === "conflict") return this.resetResult("conflict");
        if (admission === "gap") return this.resetResult("invalid_replay");
        if (admission === "accepted") result.accepted.push(entry);
      }
      this.drainGaps(result.accepted);
    }

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
    return result;
  }

  admitLive(entry: LedgerEvent): LedgerAdmission {
    const result = this.empty();
    if (this.activeSource === null || this.status === "retry") {
      result.stale = true;
      return result;
    }
    const admission = this.acceptForward(entry);
    if (admission === "conflict") return this.resetResult("conflict");
    if (admission === "accepted") {
      result.accepted.push(entry);
      this.drainGaps(result.accepted);
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

  private acceptOlder(events: LedgerEvent[], originalMin: number, result: LedgerAdmission, terminal: boolean): boolean {
    if (events.length === 0) return true;
    if (!this.isContiguous(events)) return false;
    if (terminal && (originalMin <= 0 || events.at(-1)!.seq !== originalMin - 1)) return false;
    for (const entry of events) {
      if (entry.seq >= originalMin) {
        const old = this.bySeq.get(entry.seq);
        if (!old || !sameEvent(old, entry)) return false;
        continue;
      }
      const old = this.bySeq.get(entry.seq);
      if (old && !sameEvent(old, entry)) return false;
      if (!old) {
        this.bySeq.set(entry.seq, entry);
        result.accepted.push(entry);
      }
    }
    return true;
  }

  private acceptForward(entry: LedgerEvent): "accepted" | "duplicate" | "conflict" | "gap" {
    const old = this.bySeq.get(entry.seq);
    if (old) return sameEvent(old, entry) ? "duplicate" : "conflict";
    const buffered = this.gaps.get(entry.seq);
    if (buffered) return sameEvent(buffered, entry) ? "duplicate" : "conflict";
    const cursor = this.cursor;
    if (cursor === 0 || entry.seq === cursor + 1) {
      this.bySeq.set(entry.seq, entry);
      return "accepted";
    }
    return "gap";
  }

  private drainGaps(accepted: LedgerEvent[]): void {
    while (true) {
      const entry = this.gaps.get(this.cursor + 1);
      if (!entry) break;
      this.gaps.delete(entry.seq);
      this.gapBytes -= JSON.stringify(entry).length;
      this.bySeq.set(entry.seq, entry);
      accepted.push(entry);
    }
    if (this.gaps.size === 0) this.repairLatched = false;
  }

  private isStrictlyAscending(events: readonly LedgerEvent[]): boolean {
    for (let index = 1; index < events.length; index++) {
      if (events[index - 1]!.seq >= events[index]!.seq) return false;
    }
    return true;
  }

  private isContiguous(events: readonly LedgerEvent[]): boolean {
    for (let index = 1; index < events.length; index++) {
      if (events[index]!.seq !== events[index - 1]!.seq + 1) return false;
    }
    return true;
  }

  private clear(sourceGeneration: string, clearFailures = true): void {
    this.bySeq.clear();
    this.gaps.clear();
    this.gapBytes = 0;
    this.repairLatched = false;
    this.completion = null;
    if (clearFailures) this.failures.clear();
    this.activeSource = sourceGeneration;
  }

  private empty(): LedgerAdmission {
    return { accepted: [], stale: false, reset: null, repair: null, rebuild: false };
  }

  private resetResult(reason: LedgerResetReason): LedgerAdmission {
    // A protocol fault invalidates the whole provisional baseline. Recovery must
    // rebuild canonical state from a fresh cold tail; preserving the prefix here
    // lets stale frames cross the fault after the controller resets the reducer.
    this.bySeq.clear();
    this.gaps.clear();
    this.gapBytes = 0;
    this.repairLatched = false;
    this.completion = null;
    this.active = null;
    this.status = "cold";
    return { accepted: [], stale: false, reset: reason, repair: null, rebuild: false };
  }
}

function sameEvent(a: LedgerEvent, b: LedgerEvent): boolean {
  return JSON.stringify(a.event) === JSON.stringify(b.event);
}
