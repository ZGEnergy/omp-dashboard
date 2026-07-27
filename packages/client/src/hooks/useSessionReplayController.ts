import type {
  AssetReplayChunkMessage,
  AssetUnavailableMessage,
  EventMessage,
  EventReplayMessage,
  SessionStateResetMessage,
} from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import {
  type LedgerEvent,
  type ReplayRequest,
  SessionReplayLedger,
  type SessionReplayLedgerOptions,
} from "../lib/session-replay-ledger.js";
import {
  buildLoadOlderSubscribe,
  buildSessionSubscribe,
  type SessionSubscribeMessage,
} from "../lib/session-subscribe.js";
import type { ReplayReason } from "../lib/subscription-decision.js";

export type ReplayInbound = EventReplayMessage | EventMessage | SessionStateResetMessage | AssetReplayChunkMessage | AssetUnavailableMessage;

export interface ReplayWindowMetadata {
  minSeq: number | null;
  hasMoreOlder: boolean | null;
  partialHead: boolean | null;
  kind: ReplayRequest["kind"];
}

export interface ReplayControllerEffects {
  send(message: SessionSubscribeMessage): void;
  /** Reducer/persister/plugin effects are called only after ledger admission. */
  apply(sessionId: string, events: readonly LedgerEvent[]): void;
  /** Authoritative server window metadata for every admitted replay frame. */
  window?(sessionId: string, metadata: ReplayWindowMetadata): void;
  /** The ledger dropped its head to keep the hot transcript within budget. */
  trimmed?(sessionId: string, minSeq: number): void;
  /** Prune the reducer's hot state to the ledger's two-tier retention floor. */
  evict?(sessionId: string, minSeq: number): void;
  /** Older replay is rebuilt atomically from the same canonical sequence. */
  replace(
    sessionId: string,
    events: readonly LedgerEvent[],
    completion: { requestId: string; anchorToken?: string } | null,
  ): void;
  reset(sessionId: string): void;
  loading(sessionId: string, loading: boolean): void;
  reconnect(reason: "retry"): void;
  publishAsset(sessionId: string, asset: { hash: string; mimeType: string; data: string }): void;
  assetUnavailable?(sessionId: string, hash: string, reason: string): void;
  retry?(sessionId: string, kind: ReplayRequest["kind"]): void;
}

export interface SessionReplayControllerOptions extends Pick<SessionReplayLedgerOptions, "maxRetainedBytes"> {}

interface PendingRequest extends ReplayRequest {
  /** Local replay authority increments whenever a request is superseded. */
  replayGeneration: number;
  deadline: ReturnType<typeof setTimeout>;
}

interface AssetAssembly {
  requestId: string;
  sourceGeneration: string;
  mimeType: string;
  chunkCount: number;
  chunks: Map<number, string>;
  bytes: number;
}

const MAX_ASSET_CHUNKS = 256;
const MAX_ASSET_BYTES = 1024 * 1024;
const ASSET_HASH = /^[A-Za-z0-9_-]{1,256}$/;
const MIME_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;
function hasUserTurnStart(events: readonly LedgerEvent[]): boolean {
  return events.some(({ event }) => {
    if (event.eventType !== "message_start" && event.eventType !== "message_end") return false;
    const data = event.data as Record<string, unknown>;
    const message = data.message && typeof data.message === "object"
      ? data.message as Record<string, unknown>
      : data;
    return message.role === "user";
  });
}


/**
 * Stateful controller used by App integration. It is deliberately framework
 * agnostic so every replay path (socket handler, cache admission and retries)
 * gets one authority gate before touching reducer/cache/plugin/loading state.
 */
export class SessionReplayController {
  private readonly ledgers = new Map<string, SessionReplayLedger>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly assets = new Map<string, Map<string, AssetAssembly>>();
  private readonly assetTotals = new Map<string, { requestId: string; chunks: number; bytes: number }>();
  /** Completed hashes are retained while a request is active so duplicate full sequences stay inert. */
  private readonly completedAssetHashes = new Map<string, Map<string, Set<string>>>();
  private readonly replayGenerations = new Map<string, number>();
  /** Smallest cursor already used for automatic backward hydration. */
  private readonly automaticOlderFloor = new Map<string, number>();

  constructor(
    private readonly effects: ReplayControllerEffects,
    private readonly options: SessionReplayControllerOptions = {},
  ) {}

  ledger(sessionId: string): SessionReplayLedger {
    let ledger = this.ledgers.get(sessionId);
    if (!ledger) {
      ledger = new SessionReplayLedger(sessionId, this.options);
      this.ledgers.set(sessionId, ledger);
    }
    return ledger;
  }

  /**
   * Adjust a session's retained-bytes cap. Raising it (the user is reading
   * older history) lifts the ceiling so paged-in rows are not pruned; lowering
   * it back to the base ceiling (the user returned to the live tail) flushes
   * the ledger head and prunes the reducer's two-tier floors to match. No-op
   * for a session with no ledger.
   */
  setRetentionCap(sessionId: string, bytes: number): void {
    const ledger = this.ledgers.get(sessionId);
    if (!ledger) return;
    if (!ledger.setMaxRetainedBytes(bytes)) return;
    this.effects.trimmed?.(sessionId, ledger.minSeq);
    if (ledger.status === "ready") this.effects.evict?.(sessionId, ledger.minSeq);
  }

  /**
   * Re-materialize a session's reducer rows from the already-resident ledger
   * events, WITHOUT any server request or ledger admission. Used to expand an
   * interior `EvictedToolBurst` marker in place (issue #77): the raw events for
   * the evicted range are still in the ledger — only the derived rows were
   * two-tier-pruned — so a full re-reduce from `ledger.events` (the exact
   * `replace` effect the older-page terminal uses) rebuilds every row and
   * clears `evictedToolBursts`. Passing `null` completion means no load-older
   * latch is touched.
   *
   * CRITICAL INVARIANT: this NEVER calls `begin`/`admit`, so the ledger's
   * single-contiguous-island gate (`acceptOlder`) is never touched and no
   * non-contiguous frame is ever created. No-op unless the ledger is `ready`.
   */
  rematerialize(sessionId: string): void {
    const ledger = this.ledgers.get(sessionId);
    if (!ledger) return;
    if (ledger.status !== "ready") return;
    this.effects.replace(sessionId, ledger.events, null);
  }

  /** Cache must contain a primary conversation turn before it can supersede canonical cold replay. */
  seedCached(sessionId: string, sourceGeneration: string, events: readonly LedgerEvent[]): boolean {
    if (!hasUserTurnStart(events)) return false;
    return this.ledger(sessionId).seed(sourceGeneration, events);
  }

  begin(sessionId: string, kind: ReplayRequest["kind"], sourceGeneration = "", anchorToken?: string, reason: ReplayReason = "initial_navigation"): SessionSubscribeMessage {
    if (kind === "cold") this.automaticOlderFloor.delete(sessionId);
    const ledger = this.ledger(sessionId);
    const message = kind === "older"
      ? buildLoadOlderSubscribe(sessionId, ledger.minSeq, sourceGeneration)
      : buildSessionSubscribe(sessionId, kind === "cold" ? 0 : ledger.cursor, sourceGeneration);
    // Observability (#59 AC): identify why every replay was issued.
    console.debug("[replay] begin", { sessionId, kind, reason, requestId: message.requestId, cursor: kind === "cold" ? 0 : ledger.cursor, sourceGeneration });
    const replayGeneration = (this.replayGenerations.get(sessionId) ?? 0) + 1;
    this.replayGenerations.set(sessionId, replayGeneration);
    const request: ReplayRequest = {
      requestId: message.requestId!,
      kind,
      sourceGeneration,
      ...(kind === "older" ? { fromSeq: ledger.minSeq, anchorToken } : {}),
    };
    this.clearPending(sessionId);
    ledger.begin(request);
    const timeoutMs = kind === "cold" ? 90_000 : 15_000;
    const deadline = setTimeout(() => this.timeout(sessionId, request.requestId), timeoutMs);
    this.pending.set(sessionId, { ...request, replayGeneration, deadline });
    this.effects.loading(sessionId, true);
    this.effects.send(message);
    return message;
  }

  handle(message: ReplayInbound): boolean {
    if (message.type === "event") return this.handleLive(message);
    if (message.type === "event_replay") return this.handleReplay(message);
    if (message.type === "session_state_reset") return this.handleReset(message);
    if (message.type === "asset_replay_chunk") return this.handleAssetChunk(message);
    return this.handleAssetUnavailable(message);
  }

  /** Atomically clear one session's replay authority and rendered state. */
  reset(sessionId: string, sourceGeneration?: string): void {
    this.automaticOlderFloor.delete(sessionId);
    const ledger = this.ledger(sessionId);
    this.handleReset({
      type: "session_state_reset",
      sessionId,
      sourceGeneration: sourceGeneration ?? ledger.sourceGeneration ?? "",
      reason: "manual_reset",
    });
  }

  dispose(sessionId?: string): void {
    if (sessionId) this.automaticOlderFloor.delete(sessionId);
    else this.automaticOlderFloor.clear();
    const ids = sessionId ? [sessionId] : [...new Set([...this.pending.keys(), ...this.ledgers.keys()])];
    for (const id of ids) {
      this.clearPending(id);
      this.ledger(id).cancel();
    }
    if (sessionId) this.clearAssets(sessionId);
    else {
      this.assets.clear();
      this.assetTotals.clear();
      this.completedAssetHashes.clear();
    }
  }

  /**
   * Cancel in-flight replay requests (e.g. on a transport reconnect) without
   * dropping retained ledger tails. Stops stale request deadlines from firing a
   * recover→reconnect after the socket has already been replaced, while keeping
   * each session's baseline so a returning session can still resume via delta.
   */
  cancelInflight(): void {
    for (const sessionId of [...this.pending.keys()]) this.clearPending(sessionId);
  }

  private handleLive(message: EventMessage): boolean {
    const ledger = this.ledgers.get(message.sessionId);
    if (!ledger) return false; // ordinary live handling remains available before replay ownership begins
    const result = ledger.admitLive({ seq: message.seq, event: message.event });
    if (result.reset) {
      this.effects.reset(message.sessionId);
      this.begin(message.sessionId, "cold", ledger.sourceGeneration ?? "", undefined, "conflict");
      return true;
    }
    if (result.accepted.length) this.publishAdmitted(message.sessionId, result);
    if (result.repair) this.begin(message.sessionId, "delta", ledger.sourceGeneration!, undefined, "live_gap");
    return true;
  }

  private handleReplay(message: EventReplayMessage): boolean {
    const ledger = this.ledgers.get(message.sessionId);
    if (!ledger) return false;
    const pending = this.pending.get(message.sessionId);
    // Error terminals are failures, never successful ledger completion. Handle them
    // before admission because ledger.admit() marks any terminal frame ready.
    if (message.errorCode && message.isLast && pending && pending.requestId === message.requestId &&
      pending.kind === message.replayKind && this.isCurrentPending(message.sessionId, pending) &&
      (ledger.sourceGeneration === message.sourceGeneration ||
        (pending.kind === "cold" && ledger.sourceGeneration === "" && ledger.events.length === 0))) {
      this.recover(message.sessionId, { ...pending, sourceGeneration: message.sourceGeneration }, true);
      return true;
    }
    const result = ledger.admit(message);
    if (result.stale) return true;
    if (pending && pending.requestId === message.requestId && this.isCurrentPending(message.sessionId, pending)) this.resetDeadline(message.sessionId, pending);
    if (result.reset) {
      this.clearPending(message.sessionId);
      this.effects.reset(message.sessionId);
      this.begin(message.sessionId, "cold", message.sourceGeneration, undefined, "conflict");
      return true;
    }
    // A non-stale frame has passed request/source correlation and ledger admission.
    // Publish its metadata separately so terminal and empty frames cannot lose the
    // server's continuation bit, and so reducer effects remain single-application.
    this.effects.window?.(message.sessionId, {
      minSeq: message.windowMinSeq ?? null,
      hasMoreOlder: typeof message.hasMoreOlder === "boolean" ? message.hasMoreOlder : null,
      partialHead: typeof message.partialHead === "boolean" ? message.partialHead : null,
      kind: message.replayKind,
    });
    if (message.replayKind !== "older" && result.accepted.length) this.publishAdmitted(message.sessionId, result);
    if (message.isLast) {
      this.clearPending(message.sessionId);
      if (result.rebuild) {
        if (result.evictedHead) this.effects.trimmed?.(message.sessionId, ledger.minSeq);
        this.effects.replace(
          message.sessionId,
          ledger.events,
          ledger.takeOlderCompletion(),
        );
      }
      const cursor = ledger.minSeq;
      const priorCursor = this.automaticOlderFloor.get(message.sessionId);
      const shouldContinue = message.hasMoreOlder === true && message.partialHead === true &&
        (priorCursor === undefined || cursor < priorCursor);
      if (shouldContinue) {
        this.automaticOlderFloor.set(message.sessionId, cursor);
        this.begin(message.sessionId, "older", ledger.sourceGeneration ?? message.sourceGeneration, undefined, "load_older");
      } else {
        this.effects.loading(message.sessionId, false);
      }
    }
    return true;
  }

  private publishAdmitted(sessionId: string, result: { accepted: readonly LedgerEvent[]; evictedHead: boolean }): void {
    if (result.evictedHead) {
      const ledger = this.ledger(sessionId);
      this.effects.trimmed?.(sessionId, ledger.minSeq);
      // Apply the new tail before evicting so the two-tier floors are computed
      // against the up-to-date reducer state, not the pre-tail snapshot.
      this.effects.apply(sessionId, result.accepted);
      if (ledger.status === "ready") this.effects.evict?.(sessionId, ledger.minSeq);
      return;
    }
    this.effects.apply(sessionId, result.accepted);
  }

  private handleReset(message: SessionStateResetMessage): boolean {
    const ledger = this.ledgers.get(message.sessionId);
    if (!ledger) return false;
    // Observability (#59 AC): a source reset is a distinct replay trigger.
    console.debug("[replay] reset", { sessionId: message.sessionId, reason: message.reason });
    const pending = this.pending.get(message.sessionId);
    // A correlated reset for another request is stale. An uncorrelated reset
    // is authoritative for its source and must dominate any in-progress work.
    if (pending && message.requestId && pending.requestId !== message.requestId) return true;
    if (pending && message.requestId === pending.requestId && this.isCurrentPending(message.sessionId, pending)) {
      // The server's reset is part of this request: keep its correlation and
      // existing deadline, but move the request to the new cold generation.
      const replayGeneration = (this.replayGenerations.get(message.sessionId) ?? 0) + 1;
      this.replayGenerations.set(message.sessionId, replayGeneration);
      this.clearAssets(message.sessionId);
      ledger.reset(message.sourceGeneration);
      const request: ReplayRequest = { requestId: pending.requestId, kind: "cold", sourceGeneration: message.sourceGeneration };
      ledger.begin(request);
      pending.kind = request.kind;
      pending.sourceGeneration = request.sourceGeneration;
      pending.replayGeneration = replayGeneration;
      delete pending.fromSeq;
      delete pending.anchorToken;
      this.effects.reset(message.sessionId);
      return true;
    }
    this.replayGenerations.set(message.sessionId, (this.replayGenerations.get(message.sessionId) ?? 0) + 1);
    this.clearPending(message.sessionId);
    ledger.reset(message.sourceGeneration);
    this.effects.reset(message.sessionId);
    this.effects.loading(message.sessionId, false);
    return true;
  }

  private handleAssetChunk(message: AssetReplayChunkMessage): boolean {
    const ledger = this.ledgers.get(message.sessionId);
    const pending = this.pending.get(message.sessionId);
    if (!ledger || !pending || this.isCurrentPending(message.sessionId, pending) === false || pending.requestId !== message.requestId || ledger.sourceGeneration !== message.sourceGeneration) return true;
    if (ASSET_HASH.test(message.hash) === false || MIME_TYPE.test(message.mimeType) === false ||
      Number.isInteger(message.chunkIndex) === false || Number.isInteger(message.chunkCount) === false ||
      message.chunkIndex < 0 || message.chunkIndex >= message.chunkCount || message.chunkCount > MAX_ASSET_CHUNKS) return true;
    if (this.completedAssetHashes.get(message.sessionId)?.get(message.requestId)?.has(message.hash)) return true;
    const byHash = this.assets.get(message.sessionId) ?? new Map<string, AssetAssembly>();
    this.assets.set(message.sessionId, byHash);
    let totals = this.assetTotals.get(message.sessionId);
    if (!totals || totals.requestId !== message.requestId) {
      totals = { requestId: message.requestId, chunks: 0, bytes: 0 };
      this.assetTotals.set(message.sessionId, totals);
    }
    let assembly = byHash.get(message.hash);
    if (!assembly || assembly.requestId !== message.requestId || assembly.sourceGeneration !== message.sourceGeneration ||
      assembly.chunkCount !== message.chunkCount || assembly.mimeType !== message.mimeType) {
      if (assembly) {
        totals.chunks -= assembly.chunks.size;
        totals.bytes -= assembly.bytes;
      }
      assembly = { requestId: message.requestId, sourceGeneration: message.sourceGeneration, mimeType: message.mimeType, chunkCount: message.chunkCount, chunks: new Map(), bytes: 0 };
      byHash.set(message.hash, assembly);
    }
    if (!assembly.chunks.has(message.chunkIndex)) {
      const chunkBytes = new TextEncoder().encode(message.data).byteLength;
      if (totals.chunks + 1 > MAX_ASSET_CHUNKS || totals.bytes + chunkBytes > MAX_ASSET_BYTES) {
        byHash.delete(message.hash);
        this.clearAssetTotalsIfEmpty(message.sessionId);
        this.effects.assetUnavailable?.(message.sessionId, message.hash, "budget_exceeded");
        return true;
      }
      assembly.chunks.set(message.chunkIndex, message.data);
      assembly.bytes += chunkBytes;
      totals.chunks += 1;
      totals.bytes += chunkBytes;
    }
    if (assembly.chunks.size !== assembly.chunkCount) return true;
    const chunks: string[] = [];
    for (let index = 0; index < assembly.chunkCount; index += 1) {
      const chunk = assembly.chunks.get(index);
      if (chunk == null) return true;
      chunks.push(chunk);
    }
    byHash.delete(message.hash);
    totals.chunks -= assembly.chunks.size;
    totals.bytes -= assembly.bytes;
    this.clearAssetTotalsIfEmpty(message.sessionId);
    const completedByRequest = this.completedAssetHashes.get(message.sessionId) ?? new Map<string, Set<string>>();
    const completed = completedByRequest.get(message.requestId) ?? new Set<string>();
    completed.add(message.hash);
    completedByRequest.set(message.requestId, completed);
    this.completedAssetHashes.set(message.sessionId, completedByRequest);
    this.effects.publishAsset(message.sessionId, { hash: message.hash, mimeType: message.mimeType, data: chunks.join("") });
    return true;
  }

  private handleAssetUnavailable(message: AssetUnavailableMessage): boolean {
    const ledger = this.ledgers.get(message.sessionId);
    const pending = this.pending.get(message.sessionId);
    if (!ledger || !pending || !this.isCurrentPending(message.sessionId, pending) || pending.requestId !== message.requestId || ledger.sourceGeneration !== message.sourceGeneration || !ASSET_HASH.test(message.hash)) return true;
    const assembly = this.assets.get(message.sessionId)?.get(message.hash);
    if (assembly) {
      const totals = this.assetTotals.get(message.sessionId);
      if (totals) {
        totals.chunks -= assembly.chunks.size;
        totals.bytes -= assembly.bytes;
      }
      this.assets.get(message.sessionId)?.delete(message.hash);
      this.clearAssetTotalsIfEmpty(message.sessionId);
    }
    this.effects.assetUnavailable?.(message.sessionId, message.hash, message.reason);
    return true;
  }

  private timeout(sessionId: string, requestId: string): void {
    const pending = this.pending.get(sessionId);
    if (!pending || pending.requestId !== requestId || this.isCurrentPending(sessionId, pending) === false) return;
    this.recover(sessionId, pending, pending.kind === "cold");
  }

  private recover(sessionId: string, request: ReplayRequest, reuseTransport = false): void {
    const pending = this.pending.get(sessionId);
    if (!pending || pending.requestId !== request.requestId || this.isCurrentPending(sessionId, pending) === false) return;
    const ledger = this.ledger(sessionId);
    this.clearPending(sessionId);
    this.effects.loading(sessionId, false);
    if (ledger.fail(request.kind) === "retry_state") {
      this.effects.retry?.(sessionId, request.kind);
      return;
    }
    if (!reuseTransport) this.effects.reconnect("retry");
    this.begin(sessionId, request.kind, request.sourceGeneration, request.anchorToken, "transport_reconnect");
  }

  private resetDeadline(sessionId: string, pending: PendingRequest): void {
    clearTimeout(pending.deadline);
    const timeoutMs = pending.kind === "cold" ? 90_000 : 15_000;
    pending.deadline = setTimeout(() => this.timeout(sessionId, pending.requestId), timeoutMs);
  }

  private isCurrentPending(sessionId: string, pending: PendingRequest): boolean {
    return this.replayGenerations.get(sessionId) === pending.replayGeneration;
  }

  private clearPending(sessionId: string): void {
    const pending = this.pending.get(sessionId);
    if (pending) {
      clearTimeout(pending.deadline);
      const ledger = this.ledger(sessionId);
      // A terminal frame has already detached the ledger request and marked it
      // ready; do not turn that completed state into retry while clearing UI work.
      if (ledger.request?.requestId === pending.requestId) ledger.cancel(pending.requestId);
    }
    this.pending.delete(sessionId);
    this.clearAssets(sessionId);
  }

  private clearAssets(sessionId: string): void {
    this.assets.delete(sessionId);
    this.assetTotals.delete(sessionId);
    this.completedAssetHashes.delete(sessionId);
  }

  private clearAssetTotalsIfEmpty(sessionId: string): void {
    const byHash = this.assets.get(sessionId);
    if (!byHash || byHash.size === 0) {
      this.assets.delete(sessionId);
      this.assetTotals.delete(sessionId);
    }
  }
}

/** Named factory for App hooks; call once through useMemo in React integration. */
export function useSessionReplayController(effects: ReplayControllerEffects): SessionReplayController {
  return new SessionReplayController(effects);
}
