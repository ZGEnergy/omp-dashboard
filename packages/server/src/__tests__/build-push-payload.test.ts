/**
 * Unit tests for buildPushPayload — the pure trigger→notification mapper.
 *
 * Fixtures cover all three `isUnreadTrigger` cases: turn-done
 * (streaming→idle), ask_user, and agent_end-with-error.
 * See change: add-server-push-notifications.
 */

import type { DashboardEvent, DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { buildPushPayload } from "../push/build-push-payload.js";

function session(overrides: Partial<DashboardSession> = {}): DashboardSession {
  return {
    id: "abc-123",
    cwd: "/repo",
    source: "tui",
    status: "idle",
    startedAt: 0,
    name: "my-session",
    ...overrides,
  } as DashboardSession;
}

function event(eventType: string, data: Record<string, unknown> = {}): DashboardEvent {
  return { eventType, timestamp: 0, data };
}

describe("buildPushPayload", () => {
  it("always links to /session/<id> with the session_attention type", () => {
    const p = buildPushPayload(session(), event("agent_end"));
    expect(p.type).toBe("session_attention");
    expect(p.sessionId).toBe("abc-123");
    expect(p.url).toBe("/session/abc-123");
    expect(typeof p.title).toBe("string");
    expect(p.title.length).toBeGreaterThan(0);
  });

  it("turn-done (streaming→idle): body reflects the session, no error", () => {
    const p = buildPushPayload(session({ status: "idle", name: "worker" }), event("agent_end"));
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.body).toContain("worker");
  });

  it("ask_user: title indicates input is needed", () => {
    const s = session({ currentTool: "ask_user", status: "idle", name: "worker" });
    const p = buildPushPayload(s, event("tool_execution_start", { tool: "ask_user" }));
    expect(p.title.toLowerCase()).toContain("input");
  });

  it("core ask: title indicates input is needed", () => {
    const s = session({ currentTool: "ask", status: "idle", name: "worker" });
    const p = buildPushPayload(s, event("tool_execution_start", { toolName: "ask" }));
    expect(p.title.toLowerCase()).toContain("input");
  });

  it("agent_end with error: body includes the truncated error text", () => {
    const s = session({ name: "worker" });
    const p = buildPushPayload(s, event("agent_end", { error: "boom: something failed" }));
    expect(p.body.toLowerCase()).toContain("boom");
  });

  it("truncates very long error text", () => {
    const longErr = "x".repeat(500);
    const p = buildPushPayload(session(), event("agent_end", { error: longErr }));
    expect(p.body.length).toBeLessThan(300);
  });

  it("falls back to the session id when the session has no name", () => {
    const s = session({ name: undefined });
    const p = buildPushPayload(s, event("agent_end"));
    expect(p.body).toContain("abc-123");
  });
});
