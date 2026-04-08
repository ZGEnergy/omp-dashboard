/**
 * Tests for handleForceKill in session-action-handler.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleForceKill } from "../browser-handlers/session-action-handler.js";
import type { BrowserHandlerContext } from "../browser-handlers/handler-context.js";

function createMockContext(sessionOverrides?: Record<string, any>): BrowserHandlerContext & { sent: any[]; broadcasts: any[] } {
  const sent: any[] = [];
  const broadcasts: any[] = [];
  return {
    ws: {} as any,
    sessionManager: {
      get: vi.fn().mockReturnValue({
        id: "sess-1",
        cwd: "/test",
        status: "streaming",
        pid: 99999,
        ...sessionOverrides,
      }),
      update: vi.fn(),
    } as any,
    eventStore: {} as any,
    piGateway: {
      closeSession: vi.fn().mockReturnValue(true),
      sendToSession: vi.fn().mockReturnValue(true),
    } as any,
    pendingForkRegistry: undefined,
    headlessPidRegistry: {
      killBySessionId: vi.fn().mockReturnValue(false),
    } as any,
    pendingResumeRegistry: {} as any,
    sendTo: vi.fn((_ws, msg) => sent.push(msg)),
    broadcast: vi.fn((msg) => broadcasts.push(msg)),
    getSubscribers: vi.fn().mockReturnValue([]),
    trackUiRequest: vi.fn(),
    replayPendingUiRequests: vi.fn(),
    markReplaying: vi.fn(),
    clearReplaying: vi.fn(),
    sent,
    broadcasts,
  } as any;
}

describe("handleForceKill", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should close bridge WebSocket and mark session ended when no PID", async () => {
    const ctx = createMockContext({ pid: undefined });

    await handleForceKill({ type: "force_kill", sessionId: "sess-1" }, ctx);

    expect(ctx.piGateway.closeSession).toHaveBeenCalledWith("sess-1");
    expect(ctx.sessionManager.update).toHaveBeenCalledWith("sess-1", expect.objectContaining({ status: "ended" }));
    
    const result = ctx.sent.find((m: any) => m.type === "force_kill_result");
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.message).toContain("no PID");
  });

  it("should send SIGTERM and mark session ended for valid PID", async () => {
    // Use a PID that doesn't exist so SIGTERM throws
    const ctx = createMockContext({ pid: 2147483647 });

    await handleForceKill({ type: "force_kill", sessionId: "sess-1" }, ctx);

    expect(ctx.piGateway.closeSession).toHaveBeenCalledWith("sess-1");
    expect(ctx.sessionManager.update).toHaveBeenCalledWith("sess-1", expect.objectContaining({ status: "ended" }));
    
    const result = ctx.sent.find((m: any) => m.type === "force_kill_result");
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.message).toContain("already exited");
  });

  it("should broadcast session_updated with ended status", async () => {
    const ctx = createMockContext({ pid: undefined });

    await handleForceKill({ type: "force_kill", sessionId: "sess-1" }, ctx);

    const update = ctx.broadcasts.find((m: any) => m.type === "session_updated");
    expect(update).toBeDefined();
    expect(update.updates.status).toBe("ended");
  });

  it("should always close the bridge WebSocket", async () => {
    const ctx = createMockContext({ pid: 12345 });

    await handleForceKill({ type: "force_kill", sessionId: "sess-1" }, ctx);

    expect(ctx.piGateway.closeSession).toHaveBeenCalledWith("sess-1");
  });

  it("should return success: false when session not found", async () => {
    const ctx = createMockContext();
    (ctx.sessionManager.get as any).mockReturnValue(undefined);

    await handleForceKill({ type: "force_kill", sessionId: "unknown" }, ctx);

    const result = ctx.sent.find((m: any) => m.type === "force_kill_result");
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.message).toContain("not found");
    expect(ctx.piGateway.closeSession).not.toHaveBeenCalled();
  });
});
