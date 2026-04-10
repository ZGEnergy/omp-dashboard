/**
 * Tests for session-sync: sendStateSync and handleSessionSwitch.
 */
import { describe, it, expect, vi } from "vitest";
import { sendStateSync } from "../session-sync.js";
import type { BridgeContext } from "../bridge-context.js";

function createMockBridgeContext(overrides?: Partial<BridgeContext>): BridgeContext {
  const sent: any[] = [];
  return {
    pi: {
      getSessionName: () => "test-session",
      getCommands: () => [],
    } as any,
    connection: {
      send: (msg: any) => sent.push(msg),
    } as any,
    sessionId: "sess-123",
    cachedCtx: {
      sessionManager: {
        getSessionFile: () => "/path/to/session.json",
        getSessionDir: () => "/path/to/session",
        getBranch: () => [{ role: "user", content: "hello" }],
        getEntries: () => [{ role: "user", content: "hello" }],
      },
    },
    cachedModelRegistry: null,
    cachedHasUI: true,
    lastModel: undefined,
    lastThinkingLevel: undefined,
    lastSessionFile: undefined,
    lastSessionDir: undefined,
    lastFirstMessage: undefined,
    lastGitBranch: undefined,
    lastGitPrNumber: undefined,
    lastSessionName: undefined,
    ...overrides,
    // Expose sent messages for assertions
    _sent: sent,
  } as any;
}

describe("sendStateSync", () => {
  it("should include pid in session_register message", () => {
    const bc = createMockBridgeContext();
    sendStateSync(bc, () => []);

    const sent = (bc as any)._sent;
    const registerMsg = sent.find((m: any) => m.type === "session_register");
    expect(registerMsg).toBeDefined();
    expect(registerMsg.pid).toBe(process.pid);
    expect(typeof registerMsg.pid).toBe("number");
    expect(registerMsg.pid).toBeGreaterThan(0);
  });
});
