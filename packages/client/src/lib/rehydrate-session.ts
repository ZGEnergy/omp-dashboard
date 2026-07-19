import { createInitialState, reduceEvent, type SessionState } from "./event-reducer.js";
import type { CachedEvent, ReplayCache, ReplayCacheScope } from "./replay-cache.js";

export interface RehydratedSession {
  lastSeq: number;
  state: SessionState;
  /** Ascending canonical entries shared with chat, plugin store, and persister. */
  events: CachedEvent[];
  pluginEvents: CachedEvent["event"][];
  minSeq: number;
  sourceGeneration?: string;
  hasMoreOlder: boolean;
  partialHead: boolean;
}

/** Every asynchronous rehydrate action is fenced by this ticket. */
export interface RehydrateAuthority {
  scope: ReplayCacheScope;
  signal: AbortSignal;
  isCurrent(): boolean;
}

export interface RehydrateOptions {
  authority: RehydrateAuthority;
  /** Cache admission deliberately stops after one second; a slow read is a miss. */
  admissionDeadlineMs?: number;
  /** Yield during long reductions so mobile foreground work stays responsive. */
  sliceMs?: number;
}

const CACHE_ADMISSION_DEADLINE_MS = 1_000;
const REDUCTION_SLICE_MS = 8;

function stale(authority: RehydrateAuthority): boolean {
  return authority.signal.aborted || !authority.isCurrent();
}

function sleepTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function canonicalPayload(payload: readonly CachedEvent[]): CachedEvent[] | null {
  const entries = [...payload].sort((a, b) => a.seq - b.seq);
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1]!.seq + 1 !== entries[index]!.seq) return null;
  }
  return entries;
}

/**
 * Load only a current server/source-scoped cache entry.  Legacy callers are
 * deliberately unsupported here: unscoped cache data is never authoritative.
 */
export async function rehydrateSession(
  sessionId: string,
  cache: ReplayCache,
  options?: RehydrateOptions,
): Promise<RehydratedSession | null> {
  // Unscoped callers cannot prove server/source authority and therefore get a
  // safe miss until App migrates to a ticketed admission call.
  if (!options) return null;
  const { authority } = options;
  if (stale(authority)) return null;
  const deadlineMs = options.admissionDeadlineMs ?? CACHE_ADMISSION_DEADLINE_MS;
  let admissionOpen = true;
  let timedOut = false;
  let aborted = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;
  const canUseAdmission = () => admissionOpen && !stale(authority);
  const abort = new Promise<null>((resolve) => {
    const onAbort = () => {
      admissionOpen = false;
      aborted = true;
      resolve(null);
    };
    if (authority.signal.aborted) {
      onAbort();
      return;
    }
    authority.signal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () => authority.signal.removeEventListener("abort", onAbort);
  });
  const timeout = new Promise<null>((resolve) => {
    deadlineTimer = setTimeout(() => {
      admissionOpen = false;
      timedOut = true;
      resolve(null);
    }, deadlineMs);
  });
  let entry: Awaited<ReturnType<ReplayCache["peekScoped"]>>;
  try {
    entry = await Promise.race([
      cache.peekScoped(authority.scope, sessionId, canUseAdmission),
      timeout,
      abort,
    ]);
  } catch {
    return null;
  } finally {
    admissionOpen = false;
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    removeAbortListener?.();
  }
  if (timedOut || aborted || stale(authority) || !entry) return null;

  const entries = canonicalPayload(entry.payload);
  if (!entries || entries.length === 0) {
    // Bad data is scoped poison. Never delete another server/source's cache.
    if (!stale(authority)) await cache.deleteScoped(authority.scope, sessionId);
    return null;
  }

  try {
    let state = createInitialState();
    const sliceMs = options.sliceMs ?? REDUCTION_SLICE_MS;
    let sliceStart = performance.now();
    for (const { event } of entries) {
      if (stale(authority)) return null;
      state = reduceEvent(state, event);
      if (performance.now() - sliceStart >= sliceMs) {
        await sleepTurn();
        if (stale(authority)) return null;
        sliceStart = performance.now();
      }
    }
    if (stale(authority)) return null;
    return {
      lastSeq: entry.maxSeq,
      minSeq: entry.minSeq ?? entries[0]!.seq,
      sourceGeneration: entry.sourceGeneration,
      hasMoreOlder: entry.hasMoreOlder ?? false,
      partialHead: entry.partialHead ?? false,
      state,
      events: entries,
      pluginEvents: entries.map(({ event }) => event),
    };
  } catch {
    // Only a current scoped cache can be poison-deleted. Timeout/abort/stale
    // authority intentionally leaves the healthy durable value untouched.
    if (!stale(authority)) await cache.deleteScoped(authority.scope, sessionId);
    return null;
  }
}
