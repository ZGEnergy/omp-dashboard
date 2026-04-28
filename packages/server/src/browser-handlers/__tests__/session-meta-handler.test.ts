/**
 * Tests for handleAttachProposal / handleDetachProposal.
 * See change: fix-mobile-attach-proposal-display.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { handleAttachProposal, handleDetachProposal } from "../session-meta-handler.js";
import { createMemorySessionManager, type SessionManager } from "../../memory-session-manager.js";
import type { BrowserHandlerContext } from "../handler-context.js";

interface PiSent {
  sessionId: string;
  msg: unknown;
}
interface Broadcast {
  type: string;
  sessionId: string;
  updates: Record<string, unknown>;
}

function makeCtx(sessionManager: SessionManager) {
  const piSends: PiSent[] = [];
  const broadcasts: Broadcast[] = [];

  const ctx = {
    sessionManager,
    piGateway: {
      sendToSession(sessionId: string, msg: unknown) {
        piSends.push({ sessionId, msg });
      },
    },
    broadcast(msg: any) {
      broadcasts.push(msg);
    },
  } as unknown as BrowserHandlerContext;

  return { ctx, piSends, broadcasts };
}

function registerSession(mgr: SessionManager, id: string, overrides: Record<string, unknown> = {}) {
  mgr.register({
    id,
    cwd: "/tmp/test",
    source: "tui",
    startedAt: Date.now(),
  });
  if (Object.keys(overrides).length > 0) mgr.update(id, overrides as any);
}

describe("handleAttachProposal — decision matrix", () => {
  let mgr: SessionManager;
  beforeEach(() => {
    mgr = createMemorySessionManager();
  });

  it("empty name + null attached → name auto-set, rename_session sent", () => {
    registerSession(mgr, "s1");
    const { ctx, piSends, broadcasts } = makeCtx(mgr);

    handleAttachProposal({ type: "attach_proposal", sessionId: "s1", changeName: "add-auth" } as any, ctx);

    const s = mgr.get("s1")!;
    expect(s.attachedProposal).toBe("add-auth");
    expect(s.name).toBe("add-auth");
    expect(piSends).toEqual([
      { sessionId: "s1", msg: { type: "rename_session", sessionId: "s1", name: "add-auth" } },
    ]);
    expect(broadcasts).toEqual([
      { type: "session_updated", sessionId: "s1", updates: { attachedProposal: "add-auth", name: "add-auth" } },
    ]);
  });

  it("custom name + null attached → name preserved, no rename_session", () => {
    registerSession(mgr, "s1", { name: "my custom" });
    const { ctx, piSends, broadcasts } = makeCtx(mgr);

    handleAttachProposal({ type: "attach_proposal", sessionId: "s1", changeName: "add-auth" } as any, ctx);

    const s = mgr.get("s1")!;
    expect(s.attachedProposal).toBe("add-auth");
    expect(s.name).toBe("my custom");
    expect(piSends).toEqual([]);
    expect(broadcasts).toEqual([
      { type: "session_updated", sessionId: "s1", updates: { attachedProposal: "add-auth" } },
    ]);
  });

  it("name === attachedProposal (auto-set) → re-tracks new change name", () => {
    registerSession(mgr, "s1", { name: "foo", attachedProposal: "foo" });
    const { ctx, piSends, broadcasts } = makeCtx(mgr);

    handleAttachProposal({ type: "attach_proposal", sessionId: "s1", changeName: "bar" } as any, ctx);

    const s = mgr.get("s1")!;
    expect(s.name).toBe("bar");
    expect(s.attachedProposal).toBe("bar");
    expect(piSends).toEqual([
      { sessionId: "s1", msg: { type: "rename_session", sessionId: "s1", name: "bar" } },
    ]);
    expect(broadcasts[0].updates).toEqual({ attachedProposal: "bar", name: "bar" });
  });

  it("custom name + non-null attached → name preserved, no rename_session", () => {
    registerSession(mgr, "s1", { name: "my custom", attachedProposal: "foo" });
    const { ctx, piSends, broadcasts } = makeCtx(mgr);

    handleAttachProposal({ type: "attach_proposal", sessionId: "s1", changeName: "bar" } as any, ctx);

    const s = mgr.get("s1")!;
    expect(s.name).toBe("my custom");
    expect(s.attachedProposal).toBe("bar");
    expect(piSends).toEqual([]);
    expect(broadcasts[0].updates).toEqual({ attachedProposal: "bar" });
  });
});

describe("handleDetachProposal — decision matrix", () => {
  let mgr: SessionManager;
  beforeEach(() => {
    mgr = createMemorySessionManager();
  });

  it("name === attachedProposal (auto-set) → name cleared, rename_session with empty name", () => {
    registerSession(mgr, "s1", { name: "foo", attachedProposal: "foo" });
    const { ctx, piSends, broadcasts } = makeCtx(mgr);

    handleDetachProposal({ type: "detach_proposal", sessionId: "s1" } as any, ctx);

    const s = mgr.get("s1")!;
    expect(s.attachedProposal).toBeNull();
    expect(s.name).toBeUndefined();
    expect(piSends).toEqual([
      { sessionId: "s1", msg: { type: "rename_session", sessionId: "s1", name: "" } },
    ]);
    expect(broadcasts[0].updates).toEqual({
      attachedProposal: null, openspecPhase: null, openspecChange: null, name: undefined,
    });
  });

  it("custom name + non-null attached → name preserved, no rename_session", () => {
    registerSession(mgr, "s1", { name: "my custom", attachedProposal: "foo" });
    const { ctx, piSends, broadcasts } = makeCtx(mgr);

    handleDetachProposal({ type: "detach_proposal", sessionId: "s1" } as any, ctx);

    const s = mgr.get("s1")!;
    expect(s.attachedProposal).toBeNull();
    expect(s.name).toBe("my custom");
    expect(piSends).toEqual([]);
    expect(broadcasts[0].updates).toEqual({
      attachedProposal: null, openspecPhase: null, openspecChange: null,
    });
  });

  it("empty name + non-null attached → name unchanged, no rename_session", () => {
    registerSession(mgr, "s1", { attachedProposal: "foo" });
    const { ctx, piSends, broadcasts } = makeCtx(mgr);

    handleDetachProposal({ type: "detach_proposal", sessionId: "s1" } as any, ctx);

    const s = mgr.get("s1")!;
    expect(s.attachedProposal).toBeNull();
    expect(s.name).toBeUndefined();
    expect(piSends).toEqual([]);
    expect(broadcasts[0].updates).toEqual({
      attachedProposal: null, openspecPhase: null, openspecChange: null,
    });
  });

  it("name set + null attached (defensive) → name preserved, no rename_session", () => {
    registerSession(mgr, "s1", { name: "foo", attachedProposal: null });
    const { ctx, piSends, broadcasts } = makeCtx(mgr);

    handleDetachProposal({ type: "detach_proposal", sessionId: "s1" } as any, ctx);

    const s = mgr.get("s1")!;
    expect(s.attachedProposal).toBeNull();
    expect(s.name).toBe("foo");
    expect(piSends).toEqual([]);
    expect(broadcasts[0].updates).toEqual({
      attachedProposal: null, openspecPhase: null, openspecChange: null,
    });
  });
});
