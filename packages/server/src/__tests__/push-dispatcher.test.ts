/**
 * Unit tests for the push dispatcher.
 *
 * Covers: fan-out to matching tokens, per-(session,device) coalescing (5 rapid
 * → 1 send; 2 devices → 2 sends; 2 sessions → 2 sends; after-window → 2 sends),
 * sessionFilter matching, dead-token pruning on `{gone:true}`, touch on ok,
 * unknown-transport skip, and fanout never throwing when a transport throws.
 *
 * Uses an injected `now()` clock for deterministic coalescing.
 * See change: add-server-push-notifications.
 */

import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPushDispatcher } from "../push/push-dispatcher.js";
import type { PushToken, PushTokenRegistry } from "../push/push-token-registry.js";
import type { PushSendResult, PushTransport } from "../push/push-transports/types.js";

function mkToken(over: Partial<PushToken> = {}): PushToken {
  return {
    id: over.id ?? "t1",
    deviceToken: over.deviceToken ?? "dev-1",
    transport: over.transport ?? "web-push",
    registeredAt: 0,
    lastUsedAt: 0,
    ...over,
  };
}

/** In-memory registry over a mutable token array. */
function mkRegistry(tokens: PushToken[]): PushTokenRegistry & { _tokens: PushToken[] } {
  return {
    _tokens: tokens,
    add: (t) => ({ ...mkToken(), ...t }),
    remove: (id) => {
      const i = tokens.findIndex((t) => t.id === id);
      if (i >= 0) tokens.splice(i, 1);
    },
    list: () => tokens.slice(),
    findByDeviceToken: (d) => tokens.find((t) => t.deviceToken === d),
    touch: vi.fn(),
  };
}

function mkTransport(kind: "web-push" | "fcm", result: PushSendResult = { ok: true }): PushTransport & { send: any } {
  return { kind, send: vi.fn(async () => result) };
}

// A session lookup that returns a minimal session for buildPushPayload.
const getSession = (sessionId: string) =>
  ({ id: sessionId, cwd: "/r", source: "tui", status: "idle", startedAt: 0, name: sessionId }) as any;

const event: DashboardEvent = { eventType: "agent_end", timestamp: 0, data: {} };

describe("push dispatcher", () => {
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000_000;
  });

  it("stops fanout while disabled and resumes after re-enable", () => {
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry: mkRegistry([mkToken()]),
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      enabled: false,
      getSession,
      now,
    });

    d.fanout("s1", event);
    expect(web.send).not.toHaveBeenCalled();

    d.setEnabled(true);
    d.fanout("s1", event);
    expect(web.send).toHaveBeenCalledTimes(1);

    d.setEnabled(false);
    d.fanout("s1", event);
    expect(web.send).toHaveBeenCalledTimes(1);
    d.setEnabled(true);
    d.fanout("s1", event);
    expect(web.send).toHaveBeenCalledTimes(2);
  });

  it("applies a new coalescing window to the next fanout", () => {
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry: mkRegistry([mkToken()]),
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });

    d.fanout("s1", event);
    d.setCoalesceWindowMs(5_000);
    clock += 6_000;
    d.fanout("s1", event);
    expect(web.send).toHaveBeenCalledTimes(2);
  });

  it("fans out to a single matching token", () => {
    const tokens = [mkToken()];
    const registry = mkRegistry(tokens);
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry,
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    d.fanout("s1", event);
    expect(web.send).toHaveBeenCalledTimes(1);
  });

  it("coalesces 5 rapid triggers for the same (session,device) into 1 send", async () => {
    const tokens = [mkToken()];
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry: mkRegistry(tokens),
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    for (let i = 0; i < 5; i++) {
      clock += 1_000; // within the 30s window
      d.fanout("s1", event);
    }
    expect(web.send).toHaveBeenCalledTimes(1);
  });

  it("sends to 2 devices for a single trigger", () => {
    const tokens = [mkToken({ id: "t1", deviceToken: "dev-1" }), mkToken({ id: "t2", deviceToken: "dev-2" })];
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry: mkRegistry(tokens),
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    d.fanout("s1", event);
    expect(web.send).toHaveBeenCalledTimes(2);
  });

  it("sends per-session for one device across two sessions", () => {
    const tokens = [mkToken()];
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry: mkRegistry(tokens),
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    d.fanout("sA", event);
    clock += 1_000;
    d.fanout("sB", event);
    expect(web.send).toHaveBeenCalledTimes(2);
  });

  it("sends again after the coalescing window closes", () => {
    const tokens = [mkToken()];
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry: mkRegistry(tokens),
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    d.fanout("s1", event);
    clock += 31_000; // past the window
    d.fanout("s1", event);
    expect(web.send).toHaveBeenCalledTimes(2);
  });

  it("respects sessionFilter (token only receives its filtered sessions)", () => {
    const tokens = [mkToken({ sessionFilter: ["s1"] })];
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry: mkRegistry(tokens),
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    d.fanout("s2", event); // not in filter → skipped
    expect(web.send).not.toHaveBeenCalled();
    d.fanout("s1", event); // in filter → sent
    expect(web.send).toHaveBeenCalledTimes(1);
  });

  it("prunes a dead token on { gone:true } and touches on ok", async () => {
    const tokens = [mkToken()];
    const registry = mkRegistry(tokens);
    const web = mkTransport("web-push", { ok: false, gone: true });
    const d = createPushDispatcher({
      registry,
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    d.fanout("s1", event);
    await new Promise((r) => setTimeout(r, 0)); // let the allSettled microtasks resolve
    expect(registry.list()).toHaveLength(0);
  });

  it("touches a live token on ok:true", async () => {
    const tokens = [mkToken()];
    const registry = mkRegistry(tokens);
    const web = mkTransport("web-push", { ok: true });
    const d = createPushDispatcher({
      registry,
      transports: { "web-push": web },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    d.fanout("s1", event);
    await new Promise((r) => setTimeout(r, 0));
    expect(registry.touch).toHaveBeenCalledWith("t1");
  });

  it("skips a token whose transport is unknown without crashing", () => {
    const tokens = [mkToken({ transport: "fcm" })];
    const web = mkTransport("web-push");
    const d = createPushDispatcher({
      registry: mkRegistry(tokens),
      transports: { "web-push": web }, // no fcm transport registered
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    expect(() => d.fanout("s1", event)).not.toThrow();
    expect(web.send).not.toHaveBeenCalled();
  });

  it("fanout never throws even when a transport send throws synchronously", () => {
    const tokens = [mkToken()];
    const badTransport: PushTransport = {
      kind: "web-push",
      send: () => {
        throw new Error("sync boom");
      },
    };
    const d = createPushDispatcher({
      registry: mkRegistry(tokens),
      transports: { "web-push": badTransport },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    expect(() => d.fanout("s1", event)).not.toThrow();
  });

  it("fanout returns void", () => {
    const d = createPushDispatcher({
      registry: mkRegistry([mkToken()]),
      transports: { "web-push": mkTransport("web-push") },
      coalesceWindowMs: 30_000,
      getSession,
      now,
    });
    const result = d.fanout("s1", event);
    expect(result).toBeUndefined();
  });
});
