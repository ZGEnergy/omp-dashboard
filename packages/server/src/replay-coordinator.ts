import { createHash } from "node:crypto";
import type { BrowserToServerMessage, EventReplayMessage, ReplayErrorCode, ServerToBrowserMessage, SessionStateResetReason } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { clampTailWindowBytes, selectNewestEventsByBudget, selectOlderEventsByBudget } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { prepareEventForReplay, utf8ByteLength } from "@blackbelt-technology/pi-dashboard-shared/prepare-event-for-replay.js";
import type { WebSocket } from "ws";
import type { BrowserHandlerContext } from "./browser-handlers/handler-context.js";
import type { DirectoryService } from "./directory-service.js";
import type { EventStore, StoredEvent } from "./memory-event-store.js";
import type { SessionManager } from "./memory-session-manager.js";

export const REPLAY_BATCH_SIZE = 50;
export const REPLAY_FRAME_BYTES = 256 * 1024;
export const REPLAY_QUEUE_EVENT_CAP = 256;
export const REPLAY_QUEUE_BYTES_CAP = 2 * 1024 * 1024;
const ASSET_CHUNK_DATA_BYTES = 160 * 1024;
const BACKPRESSURE_THRESHOLD = 1_024 * 1_024;

/** Internal adapter result: the ordered replay item remains queued until low-water. */
export const REPLAY_SEND_BACKPRESSURE = Symbol("replay-send-backpressure");
export type ReplaySendResult = boolean | void | typeof REPLAY_SEND_BACKPRESSURE;

type ReplayKind = "cold" | "delta" | "older";
type RequestKey = string;
type PersistedSourceResult =
  | { ok: true; events: StoredEvent[] | null }
  | { ok: false; code: ReplayErrorCode };

interface RequestState {
  key: RequestKey;
  requestId?: string;
  replayKind: ReplayKind;
  token: number;
  epoch: number;
  cancelled: boolean;
  done: Promise<void>;
  resolveDone: () => void;
}

interface SocketSessionState {
  queue: QueueItem[];
  queueBytes: number;
  queuedEvents: number;
  pendingLive: Map<number, { entry: StoredEvent; bytes: number }>;
  suppressed: boolean;
  draining: Promise<void>;
  deliveryTail: Promise<void>;
  epoch: number;
  nextToken: number;
  requests: Map<RequestKey, RequestState>;
}

type QueueItem =
  | { kind: "message"; msg: ServerToBrowserMessage; bytes: number; eventCount: number; requestKey?: RequestKey }
  | { kind: "barrier"; token: number; sessionId: string; requestKey: RequestKey };

export interface ReplayCoordinatorOptions {
  store: EventStore;
  directoryService?: Pick<DirectoryService, "loadSessionEvents">;
  sessionManager?: Pick<SessionManager, "get" | "update">;
  send?: (ws: WebSocket, msg: ServerToBrowserMessage) => ReplaySendResult | Promise<ReplaySendResult>;
  close?: (ws: WebSocket, code: number, reason?: string) => void;
}

export interface ReplayCoordinator {
  subscribe(msg: Extract<BrowserToServerMessage, { type: "subscribe" }>, ctx: BrowserHandlerContext): Promise<void>;
  publishLive(sessionId: string, entry: StoredEvent): void;
  completeBridgeReplay(sessionId: string, getSubscribers: (sessionId: string) => WebSocket[], replayUiState?: (ws: WebSocket, sessionId: string) => void): Promise<void>;
  broadcastReset(sessionId: string, getSubscribers: (sessionId: string) => WebSocket[], reason?: SessionStateResetReason, requestId?: string): void;
  disconnect(ws: WebSocket): void;
  unsubscribe(ws: WebSocket, sessionId: string): void;
  isSuppressed(ws: WebSocket, sessionId: string): boolean;
}

function asWebSocketOpen(ws: WebSocket): boolean {
  return Number(ws.readyState) === 1;
}
function messageBytes(msg: ServerToBrowserMessage): number {
  return utf8ByteLength(JSON.stringify(msg));
}
function replayKindFor(msg: Extract<BrowserToServerMessage, { type: "subscribe" }>): ReplayKind {
  if (msg.fromSeq != null && Number.isFinite(msg.fromSeq)) return "older";
  if ((msg.lastSeq ?? 0) > 0) return "delta";
  return "cold";
}

export function createReplayCoordinator(options: ReplayCoordinatorOptions): ReplayCoordinator {
  const states = new Map<WebSocket, Map<string, SocketSessionState>>();
  const hydration = new Map<string, Promise<PersistedSourceResult>>();
  const persistedSources = new Map<string, { sourceGeneration: string; events: StoredEvent[] }>();
  const send = options.send ?? ((ws, msg) => {
    if (!asWebSocketOpen(ws)) return false;
    try { ws.send(JSON.stringify(msg)); return true; } catch { return false; }
  });
  const close = options.close ?? ((ws, code, reason) => ws.close?.(code, reason));

  function stateFor(ws: WebSocket, sessionId: string): SocketSessionState {
    let sessions = states.get(ws);
    if (!sessions) { sessions = new Map(); states.set(ws, sessions); }
    let state = sessions.get(sessionId);
    if (!state) {
      state = { queue: [], queueBytes: 0, queuedEvents: 0, pendingLive: new Map(), suppressed: false, draining: Promise.resolve(), deliveryTail: Promise.resolve(), epoch: 0, nextToken: 0, requests: new Map() };
      sessions.set(sessionId, state);
    }
    return state;
  }
  function removeState(ws: WebSocket, sessionId: string): void {
    const sessions = states.get(ws);
    const state = sessions?.get(sessionId);
    if (state) stateOwners.delete(state);
    sessions?.delete(sessionId);
    if (sessions && sessions.size === 0) states.delete(ws);
  }
  function requestDone(): { done: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const done = new Promise<void>((r) => { resolve = r; });
    return { done, resolve };
  }
  function terminalFor(sessionId: string, request: Pick<RequestState, "requestId" | "replayKind">, errorCode?: ReplayErrorCode, delivered?: Array<{ seq: number; event: unknown }>): EventReplayMessage {
    const range = options.store.getRetainedRange(sessionId);
    return {
      type: "event_replay", sessionId, ...(request.requestId ? { requestId: request.requestId } : {}),
      sourceGeneration: options.store.getSourceGeneration(sessionId), replayKind: request.replayKind,
      events: [], isLast: true,
      windowMinSeq: delivered?.[0]?.seq ?? null, windowMaxSeq: delivered?.at(-1)?.seq ?? null,
      retainedMinSeq: range.retainedMinSeq, hasMoreOlder: false, partialHead: false,
      historyTruncated: range.historyTruncated, ...(errorCode ? { errorCode } : {}),
    };
  }
  function clearQueued(state: SocketSessionState): void {
    state.queue = [];
    state.queueBytes = 0;
    state.queuedEvents = 0;
    state.pendingLive.clear();
  }
  function resolveAll(state: SocketSessionState): void {
    for (const request of state.requests.values()) request.resolveDone();
    state.requests.clear();
  }
  function queueOverflow(ws: WebSocket, sessionId: string, state: SocketSessionState): void {
    const requests = [...state.requests.values()];
    state.epoch += 1;
    clearQueued(state);
    state.suppressed = false;
    resolveAll(state);
    if (asWebSocketOpen(ws)) {
      for (const request of requests) void send(ws, terminalFor(sessionId, request, "delivery_failed"));
    }
    close(ws, 1013, "replay delivery queue overflow");
  }
  function eventCount(msg: ServerToBrowserMessage): number {
    if (msg.type === "event_replay") return Math.max(1, msg.events.length);
    return 1;
  }
  function requestValid(state: SocketSessionState, request: RequestState, ws: WebSocket): boolean {
    return !request.cancelled && state.requests.get(request.key) === request && request.epoch === state.epoch && asWebSocketOpen(ws);
  }
  function activeLiveRequests(state: SocketSessionState): boolean {
    for (const request of state.requests.values()) if (request.replayKind !== "older") return true;
    return false;
  }
  function completeRequest(state: SocketSessionState, request: RequestState): void {
    if (state.requests.get(request.key) !== request) return;
    state.requests.delete(request.key);
    request.resolveDone();
    if (!activeLiveRequests(state)) {
      state.suppressed = false;
      const pending = [...state.pendingLive.values()];
      state.pendingLive.clear();
      for (const { entry, bytes } of pending) {
        state.queueBytes = Math.max(0, state.queueBytes - bytes);
        state.queuedEvents = Math.max(0, state.queuedEvents - 1);
        enqueue(wsForState(state), sessionIdForState(state), state, { kind: "message", msg: { type: "event", sessionId: sessionIdForState(state), seq: entry.seq, event: entry.event }, bytes, eventCount: 1 });
      }
    }
  }
  // State maps are keyed by socket/session; these weak reverse lookups keep the
  // barrier completion helper independent of the queue item's callback shape.
  const stateOwners = new Map<SocketSessionState, { ws: WebSocket; sessionId: string }>();
  function wsForState(state: SocketSessionState): WebSocket { return stateOwners.get(state)!.ws; }
  function sessionIdForState(state: SocketSessionState): string { return stateOwners.get(state)!.sessionId; }

  function drain(ws: WebSocket, sessionId: string, state: SocketSessionState): void {
    state.draining = state.draining.then(async () => {
      while (state.queue.length > 0) {
        const item = state.queue.shift()!;
        if (item.kind === "barrier") {
          const request = state.requests.get(item.requestKey);
          if (request?.token === item.token) completeRequest(state, request);
          continue;
        }
        if (item.requestKey && !state.requests.has(item.requestKey)) {
          state.queueBytes = Math.max(0, state.queueBytes - item.bytes);
          state.queuedEvents = Math.max(0, state.queuedEvents - item.eventCount);
          continue;
        }
        if (!asWebSocketOpen(ws)) { resolveAll(state); return; }
        while (Number(ws.bufferedAmount ?? 0) > BACKPRESSURE_THRESHOLD && asWebSocketOpen(ws)) await new Promise((resolve) => setTimeout(resolve, 10));
        if (!asWebSocketOpen(ws)) { resolveAll(state); return; }
        const accepted = await send(ws, item.msg);
        if (accepted === REPLAY_SEND_BACKPRESSURE) {
          // Gateway pressure is temporary, not a queue overflow: restore the
          // item at the head. Its queue accounting stays reserved while the
          // retry waits, keeping the queue within its caps.
          state.queue.unshift(item);
          while (Number(ws.bufferedAmount ?? 0) > BACKPRESSURE_THRESHOLD && asWebSocketOpen(ws)) await new Promise((resolve) => setTimeout(resolve, 10));
          if (!asWebSocketOpen(ws)) { resolveAll(state); return; }
          continue;
        }
        if (accepted === false) { queueOverflow(ws, sessionId, state); return; }
        state.queueBytes = Math.max(0, state.queueBytes - item.bytes);
        state.queuedEvents = Math.max(0, state.queuedEvents - item.eventCount);
      }
    }).catch(() => queueOverflow(ws, sessionId, state));
  }
  function enqueue(ws: WebSocket, sessionId: string, state: SocketSessionState, item: QueueItem): boolean {
    if (item.kind === "message") {
      if (state.queuedEvents + item.eventCount > REPLAY_QUEUE_EVENT_CAP || state.queueBytes + item.bytes > REPLAY_QUEUE_BYTES_CAP) {
        queueOverflow(ws, sessionId, state);
        return false;
      }
      state.queueBytes += item.bytes;
      state.queuedEvents += item.eventCount;
    }
    state.queue.push(item);
    drain(ws, sessionId, state);
    return true;
  }
  function enqueueMessage(ws: WebSocket, sessionId: string, state: SocketSessionState, msg: ServerToBrowserMessage, requestKey?: RequestKey): boolean {
    return enqueue(ws, sessionId, state, { kind: "message", msg, bytes: messageBytes(msg), eventCount: eventCount(msg), requestKey });
  }
  function queueSuppressedLive(ws: WebSocket, sessionId: string, state: SocketSessionState, entry: StoredEvent): void {
    if (state.pendingLive.has(entry.seq)) return;
    const msg: ServerToBrowserMessage = { type: "event", sessionId, seq: entry.seq, event: entry.event };
    const bytes = messageBytes(msg);
    if (state.queuedEvents + 1 > REPLAY_QUEUE_EVENT_CAP || state.queueBytes + bytes > REPLAY_QUEUE_BYTES_CAP) { queueOverflow(ws, sessionId, state); return; }
    state.pendingLive.set(entry.seq, { entry, bytes });
    state.queueBytes += bytes;
    state.queuedEvents += 1;
  }

  async function loadPersistedSource(sessionId: string, context?: BrowserHandlerContext): Promise<PersistedSourceResult> {
    const sourceGeneration = options.store.getSourceGeneration(sessionId);
    const cached = persistedSources.get(sessionId);
    if (cached?.sourceGeneration === sourceGeneration) return { ok: true, events: cached.events };
    const existing = hydration.get(sessionId);
    if (existing) return existing;
    const manager = options.sessionManager ?? context?.sessionManager;
    const session = manager?.get(sessionId) as { sessionFile?: string; contextWindow?: number } | undefined;
    if (!options.directoryService || !session?.sessionFile) return { ok: true, events: null };
    const work = (async (): Promise<PersistedSourceResult> => {
      try {
        const result = await options.directoryService!.loadSessionEvents(sessionId, session.sessionFile!, session.contextWindow);
        if (!result.success) return { ok: false, code: result.error === "cancelled" ? "unavailable" : "malformed_source" };
        const events = result.events.map((event, index) => ({ seq: index + 1, event }));
        persistedSources.set(sessionId, { sourceGeneration, events });
        return { ok: true, events };
      } catch { return { ok: false, code: "malformed_source" }; }
    })();
    hydration.set(sessionId, work);
    try { return await work; } finally { hydration.delete(sessionId); }
  }

  async function ensureHydrated(sessionId: string, context?: BrowserHandlerContext): Promise<PersistedSourceResult> {
    if (options.store.hasEvents(sessionId)) return { ok: true, events: null };
    const loaded = await loadPersistedSource(sessionId, context);
    if (!loaded.ok || loaded.events === null || options.store.hasEvents(sessionId)) return loaded;
    options.store.replaceEvents(sessionId, loaded.events.map((entry) => entry.event));
    persistedSources.set(sessionId, { sourceGeneration: options.store.getSourceGeneration(sessionId), events: loaded.events });
    const manager = options.sessionManager ?? context?.sessionManager;
    manager?.update(sessionId, { dataUnavailable: false });
    return loaded;
  }
  function inlineAssetRegistrar(sessionId: string, ctx: BrowserHandlerContext): (asset: { data: string; mimeType: string }) => string | undefined {
    return ({ data, mimeType }) => {
      if (!data || !mimeType) return undefined;
      const manager = options.sessionManager ?? ctx.sessionManager;
      const session = manager?.get(sessionId) as { assets?: Record<string, { data: string; mimeType: string }> } | undefined;
      if (!session) return undefined;
      const hash = createHash("sha256").update(mimeType).update("\0").update(data).digest("base64url");
      if (!session.assets?.[hash]) manager?.update(sessionId, { assets: { ...(session.assets ?? {}), [hash]: { data, mimeType } } });
      return hash;
    };
  }

  async function deliverRequest(msg: Extract<BrowserToServerMessage, { type: "subscribe" }>, ctx: BrowserHandlerContext, state: SocketSessionState, request: RequestState, resetReason?: SessionStateResetReason): Promise<void> {
    const previous = state.deliveryTail;
    let release!: () => void;
    state.deliveryTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      await deliverRequestBody(msg, ctx, state, request, resetReason);
    } finally {
      release();
    }
  }

  async function deliverRequestBody(msg: Extract<BrowserToServerMessage, { type: "subscribe" }>, ctx: BrowserHandlerContext, state: SocketSessionState, request: RequestState, resetReason?: SessionStateResetReason): Promise<void> {
    const ws = ctx.ws;
    const sessionId = msg.sessionId;
    if (!requestValid(state, request, ws)) return;
    const budget = clampTailWindowBytes(msg.windowBytes);
    const windowBudget = Math.max(1024, Math.min(budget, REPLAY_FRAME_BYTES - 2048));
    const raw = options.store.getEvents(sessionId, 1);
    const retainedRange = options.store.getRetainedRange(sessionId);
    const needsPersistedPaging = retainedRange.historyTruncated && (retainedRange.retainedMinSeq ?? 1) > 1;
    let persistedRaw: StoredEvent[] | undefined;
    if (needsPersistedPaging && (request.replayKind === "older" || (request.replayKind === "cold" && msg.mode === "tail"))) {
      const persisted = await loadPersistedSource(sessionId, ctx);
      if (!requestValid(state, request, ws)) return;
      if (persisted.ok) persistedRaw = persisted.events ?? undefined;
    }
    const snapshotMax = raw.at(-1)?.seq ?? 0;
    for (const [seq, { bytes }] of state.pendingLive) {
      if (!raw.some((entry) => entry.seq === seq)) continue;
      state.pendingLive.delete(seq);
      state.queueBytes = Math.max(0, state.queueBytes - bytes);
      state.queuedEvents = Math.max(0, state.queuedEvents - 1);
    }

    let initial: StoredEvent[];
    let selectionHasMoreOlder = false;
    let selectionPartialHead = false;
    if (request.replayKind === "older") {
      const usePersisted = persistedRaw !== undefined && retainedRange.retainedMinSeq != null && msg.fromSeq! <= retainedRange.retainedMinSeq;
      const selected = selectOlderEventsByBudget(usePersisted ? persistedRaw! : raw, msg.fromSeq!, windowBudget);
      const selectedSeqs = new Set(selected.events.map((entry) => entry.seq));
      initial = usePersisted ? selected.events : raw.filter((entry) => selectedSeqs.has(entry.seq));
      selectionHasMoreOlder = selected.hasMoreOlder;
      selectionPartialHead = selected.partialHead;
    } else if (request.replayKind === "delta") {
      initial = raw.filter((entry) => entry.seq > (msg.lastSeq ?? 0));
    } else if (msg.mode === "tail") {
      const selected = selectNewestEventsByBudget(raw, windowBudget);
      const selectedSeqs = new Set(selected.events.map((entry) => entry.seq));
      initial = raw.filter((entry) => selectedSeqs.has(entry.seq));
      selectionHasMoreOlder = selected.hasMoreOlder || Boolean(persistedRaw?.some((entry) => retainedRange.retainedMinSeq != null && entry.seq < retainedRange.retainedMinSeq));
      selectionPartialHead = selected.partialHead;
    } else initial = raw;

    const catchup = request.replayKind === "older" ? [] : options.store.getEvents(sessionId, snapshotMax + 1);
    const candidates = [...initial, ...catchup];
    const preparedCandidates = candidates.map((entry) => ({ seq: entry.seq, event: prepareEventForReplay(entry.event, { maxEventBytes: windowBudget, maxTextBytes: windowBudget }).event }));
    const terminalReserve = 1024;
    const eventBatches: Array<Array<{ seq: number; event: any }>> = [];
    let eventBytes = 0;
    let current: Array<{ seq: number; event: any }> = [];
    for (const entry of preparedCandidates) {
      const candidate = [...current, entry];
      const frame: EventReplayMessage = { type: "event_replay", sessionId, ...(msg.requestId ? { requestId: msg.requestId } : {}), sourceGeneration: options.store.getSourceGeneration(sessionId), replayKind: request.replayKind, events: candidate, isLast: false, windowMinSeq: null, windowMaxSeq: null, retainedMinSeq: options.store.getRetainedRange(sessionId).retainedMinSeq, hasMoreOlder: selectionHasMoreOlder, partialHead: selectionPartialHead, historyTruncated: options.store.getRetainedRange(sessionId).historyTruncated };
      const bytes = messageBytes(frame);
      if (candidate.length > REPLAY_BATCH_SIZE || bytes > REPLAY_FRAME_BYTES || eventBytes + bytes + terminalReserve > budget) {
        if (current.length > 0) { eventBatches.push(current); eventBytes += messageBytes({ ...frame, events: current }); current = []; }
        const single = { ...frame, events: [entry] };
        const singleBytes = messageBytes(single);
        if (singleBytes <= REPLAY_FRAME_BYTES && eventBytes + singleBytes + terminalReserve <= budget) current = [entry];
        else break;
      } else current = candidate;
    }
    if (current.length > 0) { const sample = { type: "event_replay", sessionId, events: current, isLast: false } as any; eventBatches.push(current); eventBytes += messageBytes(sample); }
    const plannedEntries = eventBatches.flat();
    const rawEventsBySeq = new Map(candidates.map((entry) => [entry.seq, entry.event]));
    const registerInlineAsset = inlineAssetRegistrar(sessionId, ctx);
    const finalPrepared = plannedEntries.map((entry) => {
      const prepared = prepareEventForReplay(rawEventsBySeq.get(entry.seq) ?? entry.event, { maxEventBytes: windowBudget, maxTextBytes: windowBudget, registerInlineAsset });
      return { seq: entry.seq, event: prepared.event, assetHashes: prepared.assetHashes };
    });
    let preparedOffset = 0;
    const finalBatches = eventBatches.map((batch) => {
      const prepared = finalPrepared.slice(preparedOffset, preparedOffset + batch.length).map(({ seq, event }) => ({ seq, event }));
      preparedOffset += batch.length;
      return prepared;
    });
    const finalEntries = finalBatches.flat();
    eventBytes = finalBatches.reduce((sum, batch) => sum + messageBytes({ type: "event_replay", sessionId, ...(msg.requestId ? { requestId: msg.requestId } : {}), sourceGeneration: options.store.getSourceGeneration(sessionId), replayKind: request.replayKind, events: batch, isLast: false, windowMinSeq: finalEntries[0]?.seq ?? null, windowMaxSeq: finalEntries.at(-1)?.seq ?? null, retainedMinSeq: options.store.getRetainedRange(sessionId).retainedMinSeq, hasMoreOlder: selectionHasMoreOlder, partialHead: selectionPartialHead, historyTruncated: options.store.getRetainedRange(sessionId).historyTruncated } as EventReplayMessage), 0);
    const hashes = new Set(finalPrepared.flatMap((entry) => entry.assetHashes));
    // Keep delivery robust if a prepared legacy image block exposes only its
    // canonical `src` token; the wire event still references the asset.
    for (const entry of finalPrepared) {
      const serialized = JSON.stringify(entry.event);
      for (const match of serialized.matchAll(/pi-asset:([A-Za-z0-9_-]+)/g)) hashes.add(match[1]!);
    }
    if (resetReason) {
      if (!enqueueMessage(ws, sessionId, state, { type: "session_state_reset", sessionId, sourceGeneration: options.store.getSourceGeneration(sessionId), reason: resetReason, ...(msg.requestId ? { requestId: msg.requestId } : {}) } as any, request.key)) return;
      await state.draining;
      if (!requestValid(state, request, ws)) return;
    }
    const session = (options.sessionManager ?? ctx.sessionManager)?.get(sessionId) as { assets?: Record<string, { data: string; mimeType: string }> } | undefined;
    let usedBytes = 0;
    const enqueueAssetCounted = (out: ServerToBrowserMessage, requestKey = request.key): boolean => {
      const bytes = messageBytes(out);
      if (bytes > REPLAY_FRAME_BYTES || usedBytes + bytes + eventBytes + terminalReserve > budget) return false;
      if (!enqueueMessage(ws, sessionId, state, out, requestKey)) return false;
      usedBytes += bytes;
      return true;
    };
    const enqueueEventCounted = (out: ServerToBrowserMessage, requestKey = request.key): boolean => {
      const bytes = messageBytes(out);
      if (bytes > REPLAY_FRAME_BYTES || usedBytes + bytes + terminalReserve > budget) return false;
      if (!enqueueMessage(ws, sessionId, state, out, requestKey)) return false;
      usedBytes += bytes;
      return true;
    };
    for (const hash of hashes) {
      const asset = session?.assets?.[hash];
      if (!asset || typeof asset.data !== "string" || typeof asset.mimeType !== "string") {
        if (!enqueueMessage(ws, sessionId, state, { type: "asset_unavailable", sessionId, requestId: msg.requestId ?? "", sourceGeneration: options.store.getSourceGeneration(sessionId), hash, reason: "missing" } as any, request.key)) return;
        await state.draining;
        if (!requestValid(state, request, ws)) return;
        continue;
      }
      const chunks: string[] = [];
      for (let offset = 0; offset < asset.data.length; offset += ASSET_CHUNK_DATA_BYTES) chunks.push(asset.data.slice(offset, offset + ASSET_CHUNK_DATA_BYTES));
      const count = Math.max(1, chunks.length);
      const frames = chunks.map((data, index) => ({ type: "asset_replay_chunk", sessionId, requestId: msg.requestId ?? "", sourceGeneration: options.store.getSourceGeneration(sessionId), hash, mimeType: asset.mimeType, chunkIndex: index, chunkCount: count, data } as any));
      const total = frames.reduce((sum, frame) => sum + messageBytes(frame), 0);
      if (total + usedBytes + eventBytes + terminalReserve > budget || frames.some((frame) => messageBytes(frame) > REPLAY_FRAME_BYTES)) {
        if (!enqueueMessage(ws, sessionId, state, { type: "asset_unavailable", sessionId, requestId: msg.requestId ?? "", sourceGeneration: options.store.getSourceGeneration(sessionId), hash, reason: "budget_exceeded" } as any, request.key)) return;
        await state.draining;
        if (!requestValid(state, request, ws)) return;
      } else {
        for (const frame of frames) {
          if (!enqueueAssetCounted(frame)) {
            if (!requestValid(state, request, ws)) return;
            continue;
          }
          await state.draining;
          if (!requestValid(state, request, ws)) return;
        }
      }
    }
    const delivered: Array<{ seq: number; event: any }> = [];
    for (const batch of finalBatches) {
      const frame: EventReplayMessage = { type: "event_replay", sessionId, ...(msg.requestId ? { requestId: msg.requestId } : {}), sourceGeneration: options.store.getSourceGeneration(sessionId), replayKind: request.replayKind, events: batch, isLast: false, windowMinSeq: finalEntries[0]?.seq ?? null, windowMaxSeq: finalEntries.at(-1)?.seq ?? null, retainedMinSeq: options.store.getRetainedRange(sessionId).retainedMinSeq, hasMoreOlder: selectionHasMoreOlder, partialHead: selectionPartialHead, historyTruncated: options.store.getRetainedRange(sessionId).historyTruncated };
      if (!enqueueEventCounted(frame)) {
        if (!requestValid(state, request, ws)) return;
        continue;
      }
      delivered.push(...batch);
      await state.draining;
      if (!requestValid(state, request, ws)) return;
    }
    const range = options.store.getRetainedRange(sessionId);
    const terminal: EventReplayMessage = { type: "event_replay", sessionId, ...(msg.requestId ? { requestId: msg.requestId } : {}), sourceGeneration: options.store.getSourceGeneration(sessionId), replayKind: request.replayKind, events: [], isLast: true, windowMinSeq: delivered[0]?.seq ?? null, windowMaxSeq: delivered.at(-1)?.seq ?? null, retainedMinSeq: range.retainedMinSeq, hasMoreOlder: selectionHasMoreOlder || delivered.length < finalEntries.length, partialHead: selectionPartialHead, historyTruncated: range.historyTruncated };
    if (!enqueueMessage(ws, sessionId, state, terminal, request.key)) return;
    await state.draining;
    if (!requestValid(state, request, ws)) return;
    if (request.replayKind !== "older") {
      if (!enqueue(ws, sessionId, state, { kind: "barrier", token: request.token, sessionId, requestKey: request.key })) return;
      await state.draining;
    } else if (state.requests.get(request.key) === request) {
      completeRequest(state, request);
      await state.draining;
    }
    if (!request.cancelled && request.epoch === state.epoch && asWebSocketOpen(ws)) {
      ctx.replayPendingUiRequests(ws, sessionId);
      ctx.replayUiState?.(ws, sessionId);
    }
  }

  const coordinator: ReplayCoordinator = {
    async subscribe(msg, ctx) {
      const ws = ctx.ws;
      const state = stateFor(ws, msg.sessionId);
      const kind = replayKindFor(msg);
      const key = msg.requestId ?? `legacy:${++state.nextToken}`;
      const prior = state.requests.get(key);
      if (prior) {
        prior.cancelled = true;
        state.requests.delete(key);
        prior.resolveDone();
        if (asWebSocketOpen(ws)) void send(ws, terminalFor(msg.sessionId, prior, "delivery_failed"));
      }
      const completion = requestDone();
      const request: RequestState = { key, requestId: msg.requestId, replayKind: kind, token: ++state.nextToken, epoch: state.epoch, cancelled: false, done: completion.done, resolveDone: completion.resolve };
      state.requests.set(key, request);
      stateOwners.set(state, { ws, sessionId: msg.sessionId });
      if (kind !== "older") state.suppressed = true;
      const hydrated = await ensureHydrated(msg.sessionId, ctx);
      if (!requestValid(state, request, ws)) return;
      if (!hydrated.ok) {
        enqueueMessage(ws, msg.sessionId, state, terminalFor(msg.sessionId, request, hydrated.code), request.key);
        if (kind !== "older") enqueue(ws, msg.sessionId, state, { kind: "barrier", token: request.token, sessionId: msg.sessionId, requestKey: request.key });
        else { await state.draining; completeRequest(state, request); }
        await request.done;
        return;
      }
      const range = options.store.getRetainedRange(msg.sessionId);
      const generationMatches = !msg.knownSourceGeneration || msg.knownSourceGeneration === options.store.getSourceGeneration(msg.sessionId);
      const lastSeq = msg.lastSeq ?? 0;
      const retentionGap = kind === "delta" && ((range.retainedMinSeq != null && lastSeq < range.retainedMinSeq - 1) || (range.retainedMaxSeq != null && lastSeq > range.retainedMaxSeq));
      if (!generationMatches || retentionGap) {
        const reason: SessionStateResetReason = !generationMatches ? "source_generation_mismatch" : "retention_gap";
        request.replayKind = "cold";
        state.suppressed = true;
        await deliverRequest({ ...msg, lastSeq: 0, mode: msg.mode === "tail" ? "tail" : undefined }, ctx, state, request, reason);
        return;
      }
      await deliverRequest(msg, ctx, state, request);
    },
    publishLive(sessionId, entry) {
      for (const [ws, sessions] of states) {
        const state = sessions.get(sessionId);
        if (!state || !asWebSocketOpen(ws)) continue;
        if (state.suppressed) queueSuppressedLive(ws, sessionId, state, entry);
        else enqueueMessage(ws, sessionId, state, { type: "event", sessionId, seq: entry.seq, event: entry.event });
      }
    },
    async completeBridgeReplay(sessionId, getSubscribers, replayUiState) {
      const armed = getSubscribers(sessionId).map((ws) => {
        const state = stateFor(ws, sessionId);
        stateOwners.set(state, { ws, sessionId });
        const previous = [...state.requests.values()];
        for (const request of previous) { request.cancelled = true; request.resolveDone(); }
        state.requests.clear();
        state.epoch += 1;
        state.queue = [];
        state.queueBytes = [...state.pendingLive.values()].reduce((sum, item) => sum + item.bytes, 0);
        state.queuedEvents = state.pendingLive.size;
        for (const request of previous) if (asWebSocketOpen(ws)) void send(ws, terminalFor(sessionId, request, "delivery_failed"));
        const completion = requestDone();
        const request: RequestState = { key: `bridge:${state.nextToken + 1}`, replayKind: "cold", token: ++state.nextToken, epoch: state.epoch, cancelled: false, done: completion.done, resolveDone: completion.resolve };
        state.requests.set(request.key, request);
        state.suppressed = true;
        return { ws, state, request };
      });
      await Promise.all(armed.map(async ({ ws, state, request }) => {
        const ctx = { ws, sessionManager: options.sessionManager, eventStore: options.store, replayPendingUiRequests() {}, replayUiState, } as any;
        await deliverRequest({ type: "subscribe", sessionId, lastSeq: 0 }, ctx, state, request);
      }));
    },
    broadcastReset(sessionId, getSubscribers, reason = "source_replaced", requestId) {
      const generation = options.store.getSourceGeneration(sessionId);
      for (const ws of getSubscribers(sessionId)) void send(ws, { type: "session_state_reset", sessionId, sourceGeneration: generation, reason, ...(requestId ? { requestId } : {}) } as any);
    },
    disconnect(ws) {
      const sessions = states.get(ws);
      if (sessions) for (const state of sessions.values()) { state.epoch += 1; clearQueued(state); resolveAll(state); stateOwners.delete(state); }
      states.delete(ws);
    },
    unsubscribe(ws, sessionId) {
      const state = states.get(ws)?.get(sessionId);
      if (!state) return;
      state.epoch += 1;
      clearQueued(state);
      state.suppressed = false;
      resolveAll(state);
      removeState(ws, sessionId);
    },
    isSuppressed(ws, sessionId) { return states.get(ws)?.get(sessionId)?.suppressed ?? false; },
  };
  return coordinator;
}
