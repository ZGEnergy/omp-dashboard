/**
 * Issue #107 (a) + (c): the fork preflight's split predicate, its WS/REST
 * parity, and the server-side duplicate-activation guard.
 *
 * The old preflight tested `!existsSync(sessionFile)` alone and degraded to a
 * blank spawn for ANY missing file, so a content-rich session whose JSONL pi
 * had rotated away silently opened an empty chat. It now splits: no content →
 * degrade (unchanged, see `fork-empty-session-preflight.test.ts`); has content
 * → spawn NOTHING and fail with `FORK_SOURCE_UNAVAILABLE`.
 *
 * See change: fork-action-opens-an-empty-chat.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

const existsSyncSpy = vi.fn();
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, existsSync: (p: string) => existsSyncSpy(p) };
});

vi.mock("../process-manager.js", () => ({ spawnPiSession: vi.fn() }));

vi.mock("@blackbelt-technology/pi-dashboard-shared/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({ spawnStrategy: "headless" }),
}));

import {
  FORK_SOURCE_UNAVAILABLE_CODE,
  handleResumeSession,
} from "../browser-handlers/session-action-handler.js";
import { spawnPiSession } from "../process-manager.js";
import { sessionHasForkableContent } from "../session-content.js";

function makeCtx(session: any, sentLog: any[]) {
  const enqueue = vi.fn();
  const update = vi.fn((_id: string, patch: any) => Object.assign(session, patch));
  const broadcast = vi.fn();
  const ctx = {
    ws: { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket,
    sessionManager: { get: () => session, update } as any,
    eventStore: {} as any,
    piGateway: {} as any,
    headlessPidRegistry: { register: vi.fn() } as any,
    pendingDashboardSpawns: new Map<string, number>(),
    pendingResumeIntents: { record: vi.fn() } as any,
    pendingForkRegistry: { recordFork: vi.fn() } as any,
    pendingClientCorrelations: { record: vi.fn() } as any,
    pendingAttachRegistry: { enqueue, consume: vi.fn(), size: vi.fn() } as any,
    sendTo: (_target: any, msg: any) => sentLog.push(msg),
    broadcast,
    getSubscribers: vi.fn().mockReturnValue([]),
    trackUiRequest: vi.fn(),
    replayPendingUiRequests: vi.fn(),
    markReplaying: vi.fn(),
    clearReplaying: vi.fn(),
  } as any;
  return { ctx, enqueue, update, broadcast };
}

function contentSession(overrides: Record<string, unknown>) {
  return {
    id: "SC",
    cwd: "/proj",
    status: "active",
    sessionFile: "/proj/rotated-away.jsonl",
    resuming: false,
    tokensIn: 0,
    tokensOut: 0,
    contextTokens: 0,
    firstMessage: undefined,
    ...overrides,
  };
}

describe("sessionHasForkableContent", () => {
  it("is false for a session with no content at all", () => {
    expect(sessionHasForkableContent({ tokensIn: 0, tokensOut: 0, contextTokens: 0, firstMessage: undefined })).toBe(false);
    expect(sessionHasForkableContent({})).toBe(false);
    expect(sessionHasForkableContent({ contextTokens: null })).toBe(false);
  });

  it("is true when any single content field is set", () => {
    expect(sessionHasForkableContent({ tokensIn: 30_709 })).toBe(true);
    expect(sessionHasForkableContent({ tokensOut: 12 })).toBe(true);
    expect(sessionHasForkableContent({ contextTokens: 69_607 })).toBe(true);
    expect(sessionHasForkableContent({ firstMessage: "fix the fork bug" })).toBe(true);
  });

  it("is false for a whitespace-only firstMessage", () => {
    expect(sessionHasForkableContent({ firstMessage: "   \n\t " })).toBe(false);
  });
});

describe("handleResumeSession: missing file + content → FORK_SOURCE_UNAVAILABLE", () => {
  beforeEach(() => {
    existsSyncSpy.mockReset();
    (spawnPiSession as any).mockReset();
  });

  // The reproduced live case: session 019fa587 had tokensIn 30 709 and
  // contextTokens 69 607 with no `.jsonl` on disk.
  it("spawns nothing and fails loudly with the structured code", async () => {
    existsSyncSpy.mockReturnValue(false);
    const session = contentSession({ tokensIn: 30_709, contextTokens: 69_607, attachedProposal: "feature-x" });
    const sent: any[] = [];
    const { ctx, enqueue } = makeCtx(session, sent);

    await handleResumeSession(
      { type: "resume_session", sessionId: "SC", mode: "fork", requestId: "rq_a" } as any,
      ctx,
    );

    expect(spawnPiSession).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "resume_result",
      sessionId: "SC",
      success: false,
      code: FORK_SOURCE_UNAVAILABLE_CODE,
      requestId: "rq_a",
    });
    expect(sent[0].message).toMatch(/no longer on disk/i);
  });

  it.each([
    ["tokensIn", { tokensIn: 1 }],
    ["tokensOut", { tokensOut: 1 }],
    ["contextTokens", { contextTokens: 1 }],
    ["firstMessage", { firstMessage: "hello" }],
  ])("each content field independently trips it: %s", async (_label, patch) => {
    existsSyncSpy.mockReturnValue(false);
    const sent: any[] = [];
    const { ctx } = makeCtx(contentSession(patch), sent);

    await handleResumeSession({ type: "resume_session", sessionId: "SC", mode: "fork" } as any, ctx);

    expect(spawnPiSession).not.toHaveBeenCalled();
    expect(sent[0].code).toBe(FORK_SOURCE_UNAVAILABLE_CODE);
  });

  // Regression lock on fix-fork-empty-session-silent-timeout.
  it("still degrades when the file is missing AND there is no content", async () => {
    existsSyncSpy.mockReturnValue(false);
    (spawnPiSession as any).mockResolvedValue({ success: true, message: "ok", spawnToken: "tok" });
    const sent: any[] = [];
    const { ctx } = makeCtx(contentSession({}), sent);

    await handleResumeSession({ type: "resume_session", sessionId: "SC", mode: "fork" } as any, ctx);

    expect(spawnPiSession).toHaveBeenCalledTimes(1);
    expect(sent[0].code).toBe("FORK_DEGRADED_TO_NEW");
  });
});

describe("handleResumeSession: fork `resuming` lifecycle (duplicate guard)", () => {
  beforeEach(() => {
    existsSyncSpy.mockReset();
    (spawnPiSession as any).mockReset();
  });

  it("rejects a concurrent duplicate fork and spawns only once", async () => {
    existsSyncSpy.mockReturnValue(true);
    let release: (v: any) => void = () => {};
    (spawnPiSession as any).mockImplementation(
      () => new Promise((r) => { release = r; }),
    );
    const session = contentSession({ sessionFile: "/proj/live.jsonl", tokensIn: 5 });
    const sent: any[] = [];
    const { ctx } = makeCtx(session, sent);

    const first = handleResumeSession(
      { type: "resume_session", sessionId: "SC", mode: "fork", requestId: "rq_1" } as any,
      ctx,
    );
    // Second activation (e.g. a different browser tab) arrives mid-flight.
    await handleResumeSession(
      { type: "resume_session", sessionId: "SC", mode: "fork", requestId: "rq_2" } as any,
      ctx,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ success: false, code: "resume.already_resuming", requestId: "rq_2" });

    release({ success: true, message: "ok", spawnToken: "tok" });
    await first;
    expect(spawnPiSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["normal fork", { exists: true, spawn: { success: true, message: "ok", spawnToken: "t" }, session: { sessionFile: "/proj/live.jsonl", tokensIn: 5 } }],
    ["degrade", { exists: false, spawn: { success: true, message: "ok", spawnToken: "t" }, session: {} }],
    ["loud failure", { exists: false, spawn: undefined, session: { tokensIn: 5 } }],
  ])("clears `resuming` before responding on the %s exit", async (_label, cfg: any) => {
    existsSyncSpy.mockReturnValue(cfg.exists);
    if (cfg.spawn) (spawnPiSession as any).mockResolvedValue(cfg.spawn);
    const session = contentSession(cfg.session);
    const sent: any[] = [];
    const { ctx, update, broadcast } = makeCtx(session, sent);

    await handleResumeSession({ type: "resume_session", sessionId: "SC", mode: "fork" } as any, ctx);

    // Source session stays alive after a fork, so nothing downstream would
    // ever clear this — a leak here permanently disables its Resume/Fork.
    expect(session.resuming).toBe(false);
    expect(update).toHaveBeenCalledWith("SC", { resuming: true });
    expect(update).toHaveBeenCalledWith("SC", { resuming: false });
    expect(broadcast).toHaveBeenCalledWith({ type: "session_updated", sessionId: "SC", updates: { resuming: false } });
  });

  it("does not touch `resuming` for continue mode", async () => {
    existsSyncSpy.mockReturnValue(true);
    (spawnPiSession as any).mockResolvedValue({ success: true, message: "ok", spawnToken: "t" });
    const session = contentSession({ status: "ended", sessionFile: "/proj/live.jsonl", tokensIn: 5 });
    const sent: any[] = [];
    const { ctx, update } = makeCtx(session, sent);

    await handleResumeSession({ type: "resume_session", sessionId: "SC", mode: "continue" } as any, ctx);

    expect(update).not.toHaveBeenCalledWith("SC", { resuming: true });
    expect(update).not.toHaveBeenCalledWith("SC", { resuming: false });
    expect(sent[0].success).toBe(true);
  });
});
