/**
 * End-to-end regression for the fork content predicate.
 *
 * WHY THIS FILE EXISTS. `fork-source-unavailable.test.ts` asserts the predicate
 * against hand-built literals (`sessionHasForkableContent({ tokensIn: 30_709 })`).
 * That verifies the boolean algebra and NOTHING about whether a real session
 * ever carries those fields — which is how PR #110 shipped green while the
 * predicate was inert on every live session (`extractFirstMessage` read a
 * `role` property pi's `SessionEntry` envelope does not have).
 *
 * The rule this encodes: a predicate over persisted state must be tested
 * against state produced by the pipeline that populates it, never a literal.
 *
 * So: NO MARKER IS SET BY HAND ANYWHERE IN THIS FILE. Every `DashboardSession`
 * under test comes out of the production path —
 *   pi `SessionEntry[]`
 *     → `extractFirstMessage`            (bridge, packages/extension)
 *     → `session_register` payload        (protocol)
 *     → `sessionManager.register(...)`    (server)
 *     → `sessionHasForkableContent(...)`
 * — and every event store under test is filled by `replayEntriesAsEvents`, the
 * same function the bridge replays through on reattach.
 *
 * See change: fork-content-predicate.
 */

import type { SessionRegisterMessage } from "@blackbelt-technology/pi-dashboard-shared/protocol.js";
import { replayEntriesAsEvents } from "@blackbelt-technology/pi-dashboard-shared/state-replay.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
// Cross-package relative import on purpose: this test's whole point is to
// exercise the REAL bridge function, not a server-side re-implementation.
import { extractFirstMessage } from "../../../extension/src/bridge-context.js";
import {
  FORK_DEGRADED_TO_NEW_CODE,
  FORK_SOURCE_UNAVAILABLE_CODE,
  handleResumeSession,
} from "../browser-handlers/session-action-handler.js";
import { createMemoryEventStore, type EventStore } from "../memory-event-store.js";
import { createMemorySessionManager, type SessionManager } from "../memory-session-manager.js";
import { createServer, type DashboardServer } from "../server.js";
import { sessionHasForkableContent } from "../session-content.js";

// Never spawn a real pi. Parity is about CLASSIFICATION, not the spawn itself.
vi.mock("../process-manager.js", async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    spawnPiSession: vi.fn().mockResolvedValue({ success: true, message: "spawned", spawnToken: "tok" }),
  };
});

// ── pi-shaped fixtures ──────────────────────────────────────────────
// `SessionManager.getEntries()` returns ENVELOPES. A user turn is
// `{ type: "message", message: { role: "user", content } }`.

/** A freshly-spawned pi session: model/thinking bookkeeping, no conversation. */
const FRESH_ENTRIES: unknown[] = [
  { id: "e1", type: "model_change", model: { provider: "anthropic", id: "opus" }, timestamp: 1 },
  { id: "e2", type: "thinking_level_change", level: "medium", timestamp: 2 },
];

/** A session with real conversation. */
const CONVERSATION_ENTRIES: unknown[] = [
  { id: "e1", type: "model_change", model: { provider: "anthropic", id: "opus" }, timestamp: 1 },
  {
    id: "e2",
    type: "message",
    timestamp: 2,
    message: { role: "user", content: "fix the fork bug" },
  },
  {
    id: "e3",
    type: "message",
    timestamp: 3,
    message: { role: "assistant", content: [{ type: "text", text: "on it" }] },
  },
];

const SESSION_FILE = "/proj/.pi/sessions/rotated-away.jsonl";

/** The bridge's register payload, built exactly as `session-sync.ts` builds it. */
function buildRegisterPayload(sessionId: string, entries: unknown[]): SessionRegisterMessage {
  const ctx = { sessionManager: { getEntries: () => entries } };
  return {
    type: "session_register",
    sessionId,
    cwd: "/proj",
    source: "tui",
    sessionFile: SESSION_FILE,
    // The one field under test. Whatever the real bridge function yields.
    firstMessage: extractFirstMessage(ctx),
  } as SessionRegisterMessage;
}

/** The gateway's `sessionManager.register(...)` call, as `pi-gateway.ts` makes it. */
function registerFromPayload(mgr: SessionManager, msg: SessionRegisterMessage) {
  return mgr.register({
    id: msg.sessionId,
    cwd: msg.cwd,
    source: msg.source,
    sessionFile: msg.sessionFile,
    firstMessage: msg.firstMessage,
  });
}

/** The bridge's reattach replay, as `session-sync.ts` → `event-wiring.ts` performs it. */
function replayInto(store: EventStore, sessionId: string, entries: unknown[]): void {
  for (const forward of replayEntriesAsEvents(sessionId, entries as any[])) {
    store.insertEvent(sessionId, forward.event);
  }
}

/** Register-time plugin chatter every session gets, conversation or not. */
function insertRegisterChatter(store: EventStore, sessionId: string): void {
  store.insertEvent(sessionId, {
    eventType: "flow:list-flows",
    timestamp: Date.now(),
    data: { flows: [] },
  });
}

function freshStore(): EventStore {
  return createMemoryEventStore(() => true);
}

describe("fork content predicate — real register pipeline", () => {
  it("is TRUE for a session registered from entries containing a user message", () => {
    const mgr = createMemorySessionManager();
    const payload = buildRegisterPayload("S-content", CONVERSATION_ENTRIES);
    registerFromPayload(mgr, payload);

    const session = mgr.get("S-content")!;

    // The bug: this was `undefined` for every real session.
    expect(session.firstMessage).toBe("fix the fork bug");
    // Nothing else was populated — the counters are genuinely zero on a
    // reattached session (`event-wiring.ts` resets them), which is exactly why
    // the literal-based test could not catch this.
    expect(session.tokensIn).toBe(0);
    expect(session.tokensOut).toBe(0);
    expect(session.contextTokens).toBeFalsy();

    expect(sessionHasForkableContent(session)).toBe(true);
  });

  it("is FALSE for a session registered from freshly-spawned entries", () => {
    const mgr = createMemorySessionManager();
    registerFromPayload(mgr, buildRegisterPayload("S-fresh", FRESH_ENTRIES));

    const session = mgr.get("S-fresh")!;
    expect(session.firstMessage).toBeUndefined();
    expect(sessionHasForkableContent(session, false)).toBe(false);
  });

  it("firstMessage survives a re-register that carries none (older bridge)", () => {
    const mgr = createMemorySessionManager();
    registerFromPayload(mgr, buildRegisterPayload("S-reattach", CONVERSATION_ENTRIES));
    // Reattach from a bridge that predates the fix: no firstMessage on the wire.
    mgr.register({ id: "S-reattach", cwd: "/proj", source: "tui", sessionFile: SESSION_FILE });

    expect(sessionHasForkableContent(mgr.get("S-reattach")!)).toBe(true);
  });
});

describe("event-store conversation backstop — real replay pipeline", () => {
  it("is TRUE from replayed conversation events alone (no firstMessage)", () => {
    const mgr = createMemorySessionManager();
    // Simulate an OLD bridge: registers without firstMessage, but still replays.
    mgr.register({ id: "S-events", cwd: "/proj", source: "tui", sessionFile: SESSION_FILE });
    const store = freshStore();
    insertRegisterChatter(store, "S-events");
    replayInto(store, "S-events", CONVERSATION_ENTRIES);

    const session = mgr.get("S-events")!;
    expect(session.firstMessage).toBeUndefined();
    expect(store.hasConversationEvents("S-events")).toBe(true);
    expect(sessionHasForkableContent(session, store.hasConversationEvents("S-events"))).toBe(true);
  });

  it("is FALSE for a fresh session that still has register-time plugin chatter", () => {
    // The degrade contract. `hasEvents` is TRUE here — `flow:list-flows` lands
    // at seq=1 on every session — so a naive events check would hang every
    // fresh-session fork on the 30 s spawn-register watchdog.
    // See change: fix-fork-empty-session-silent-timeout.
    const mgr = createMemorySessionManager();
    registerFromPayload(mgr, buildRegisterPayload("S-fresh2", FRESH_ENTRIES));
    const store = freshStore();
    insertRegisterChatter(store, "S-fresh2");
    replayInto(store, "S-fresh2", FRESH_ENTRIES);

    expect(store.hasEvents("S-fresh2")).toBe(true);
    expect(store.hasConversationEvents("S-fresh2")).toBe(false);
    expect(
      sessionHasForkableContent(mgr.get("S-fresh2")!, store.hasConversationEvents("S-fresh2")),
    ).toBe(false);
  });

  it("is FALSE for a session the store has never seen", () => {
    expect(freshStore().hasConversationEvents("nobody")).toBe(false);
  });

  it("does not count tool traffic or plugin chatter as conversation", () => {
    const store = freshStore();
    for (const eventType of ["flow:list-flows", "terminal:output", "tool_execution_start", "tool_execution_end", "model_select"]) {
      store.insertEvent("S-noise", { eventType, timestamp: 1, data: {} });
    }
    expect(store.hasConversationEvents("S-noise")).toBe(false);
    store.insertEvent("S-noise", { eventType: "message_end", timestamp: 2, data: {} });
    expect(store.hasConversationEvents("S-noise")).toBe(true);
  });

  it("forgets conversation after deleteEventsForSession", () => {
    const store = freshStore();
    replayInto(store, "S-del", CONVERSATION_ENTRIES);
    expect(store.hasConversationEvents("S-del")).toBe(true);
    store.deleteEventsForSession("S-del");
    expect(store.hasConversationEvents("S-del")).toBe(false);
  });
});

// ── WS / REST parity ────────────────────────────────────────────────
// The two fork preflights are hand-duplicated (`session-action-handler.ts` and
// `session-api.ts`). They MUST classify identically or the same session forks
// one way from the UI and another way from a script. Both are driven here
// against the SAME live `sessionManager` + `eventStore`, over the full input
// matrix {fresh-empty, has-firstMessage, has-events-only, has-both}.

type ParityCase = {
  label: string;
  entries: unknown[];
  /** Whether the bridge is new enough to send `firstMessage`. */
  bridgeSendsFirstMessage: boolean;
  /** Whether the bridge replayed conversation events into the store. */
  replay: boolean;
  expected: typeof FORK_DEGRADED_TO_NEW_CODE | typeof FORK_SOURCE_UNAVAILABLE_CODE;
};

const PARITY_CASES: ParityCase[] = [
  { label: "fresh-empty", entries: FRESH_ENTRIES, bridgeSendsFirstMessage: true, replay: true, expected: FORK_DEGRADED_TO_NEW_CODE },
  { label: "has-firstMessage", entries: CONVERSATION_ENTRIES, bridgeSendsFirstMessage: true, replay: false, expected: FORK_SOURCE_UNAVAILABLE_CODE },
  { label: "has-events-only", entries: CONVERSATION_ENTRIES, bridgeSendsFirstMessage: false, replay: true, expected: FORK_SOURCE_UNAVAILABLE_CODE },
  { label: "has-both", entries: CONVERSATION_ENTRIES, bridgeSendsFirstMessage: true, replay: true, expected: FORK_SOURCE_UNAVAILABLE_CODE },
];

describe("fork preflight WS/REST parity", () => {
  let server: DashboardServer;
  let httpPort: number;

  beforeAll(async () => {
    server = await createServer({
      port: 0, piPort: 0, host: "127.0.0.1", dev: true,
      autoShutdown: false, shutdownIdleSeconds: 999, tunnel: false,
    });
    await server.start();
    httpPort = server.httpPort()!;
  });

  afterAll(async () => {
    if (server) { try { await server.stop(); } catch { /* */ } }
  });

  /**
   * Set up one case on the LIVE server state. `sessionFile` points at a path
   * that genuinely does not exist, so no `existsSync` mock is needed — the
   * preflight sees the real missing-file condition.
   */
  function seed(id: string, kase: ParityCase): void {
    const payload = buildRegisterPayload(id, kase.entries);
    const missingFile = `/nonexistent-${id}/session.jsonl`;
    server.sessionManager.register({
      id,
      cwd: "/tmp",
      source: "tui",
      sessionFile: missingFile,
      firstMessage: kase.bridgeSendsFirstMessage ? payload.firstMessage : undefined,
    });
    server.eventStore.deleteEventsForSession(id);
    insertRegisterChatter(server.eventStore, id);
    if (kase.replay) replayInto(server.eventStore, id, kase.entries);
  }

  function wsCtx(sessionId: string, sent: any[]) {
    return {
      ws: { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
      sessionManager: server.sessionManager,
      eventStore: server.eventStore,
      piGateway: {} as any,
      headlessPidRegistry: { register: vi.fn() } as any,
      pendingDashboardSpawns: new Map<string, number>(),
      pendingResumeIntents: { record: vi.fn() } as any,
      pendingForkRegistry: { recordFork: vi.fn() } as any,
      pendingClientCorrelations: { record: vi.fn() } as any,
      pendingAttachRegistry: { enqueue: vi.fn(), consume: vi.fn(), size: vi.fn() } as any,
      sendTo: (_t: any, msg: any) => sent.push(msg),
      broadcast: vi.fn(),
      getSubscribers: vi.fn().mockReturnValue([]),
      trackUiRequest: vi.fn(),
      replayPendingUiRequests: vi.fn(),
      markReplaying: vi.fn(),
      clearReplaying: vi.fn(),
      __sessionId: sessionId,
    } as any;
  }

  it.each(PARITY_CASES)("WS and REST classify $label identically", async (kase) => {
    const wsId = `parity-ws-${kase.label}`;
    const restId = `parity-rest-${kase.label}`;
    seed(wsId, kase);
    seed(restId, kase);

    const sent: any[] = [];
    await handleResumeSession(
      { type: "resume_session", sessionId: wsId, mode: "fork" } as any,
      wsCtx(wsId, sent),
    );
    const wsCode = sent[0]?.code;

    const res = await fetch(`http://127.0.0.1:${httpPort}/api/session/${restId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "fork" }),
    });
    const restCode = (await res.json()).code;

    expect(wsCode).toBe(kase.expected);
    expect(restCode).toBe(kase.expected);
    expect(restCode).toBe(wsCode);
  });
});
