/**
 * Route tests for `/api/bootstrap/*`.
 *
 * Spins up a minimal Fastify instance with the bootstrap routes wired
 * to a fresh state store and a pair of spy triggers. No real network
 * access, no real subprocesses.
 *
 * See change: unified-bootstrap-install.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createBootstrapState, type BootstrapStateStore } from "../bootstrap-state.js";
import { registerBootstrapRoutes } from "../routes/bootstrap-routes.js";

const noopGuard = async () => {
  /* allow all requests in tests */
};

interface Harness {
  app: FastifyInstance;
  state: BootstrapStateStore;
  upgradeCalls: string[];
  retryCalls: string[];
}

async function makeHarness(): Promise<Harness> {
  const app = Fastify({ logger: false });
  const state = createBootstrapState();
  const upgradeCalls: string[] = [];
  const retryCalls: string[] = [];

  registerBootstrapRoutes(app, {
    bootstrapState: state,
    networkGuard: noopGuard,
    triggerUpgradePi: async (ticketId) => {
      upgradeCalls.push(ticketId);
    },
    triggerRetry: async (ticketId) => {
      retryCalls.push(ticketId);
    },
  });

  await app.ready();
  return { app, state, upgradeCalls, retryCalls };
}

describe("bootstrap-routes", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await makeHarness();
  });

  afterEach(async () => {
    await h.app.close();
  });

  describe("GET /api/bootstrap/status", () => {
    it("returns the current state (default ready)", async () => {
      const res = await h.app.inject({ method: "GET", url: "/api/bootstrap/status" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ready" });
    });

    it("reflects subsequent state changes", async () => {
      h.state.set({ status: "installing", progress: { step: "pi" } });
      const res = await h.app.inject({ method: "GET", url: "/api/bootstrap/status" });
      expect(res.json()).toMatchObject({
        status: "installing",
        progress: { step: "pi" },
      });
    });
  });

  describe("POST /api/bootstrap/upgrade-pi", () => {
    it("returns 202 with a ticketId and invokes the trigger", async () => {
      const res = await h.app.inject({ method: "POST", url: "/api/bootstrap/upgrade-pi" });
      expect(res.statusCode).toBe(202);
      const body = res.json() as { ticketId: string; status: string };
      expect(body.status).toBe("accepted");
      expect(typeof body.ticketId).toBe("string");
      expect(body.ticketId.length).toBeGreaterThan(0);
      // Trigger runs async — await a microtask.
      await new Promise((r) => setImmediate(r));
      expect(h.upgradeCalls).toEqual([body.ticketId]);
    });

    it("returns 409 when an install is already in progress", async () => {
      h.state.set({ status: "installing" });
      const res = await h.app.inject({ method: "POST", url: "/api/bootstrap/upgrade-pi" });
      expect(res.statusCode).toBe(409);
      expect(h.upgradeCalls).toEqual([]);
    });

    it("is allowed when status is failed (to upgrade after a previous failure)", async () => {
      h.state.set({ status: "failed", error: { message: "network" } });
      const res = await h.app.inject({ method: "POST", url: "/api/bootstrap/upgrade-pi" });
      expect(res.statusCode).toBe(202);
    });
  });

  describe("POST /api/bootstrap/retry", () => {
    it("returns 409 when status is ready", async () => {
      const res = await h.app.inject({ method: "POST", url: "/api/bootstrap/retry" });
      expect(res.statusCode).toBe(409);
      expect(h.retryCalls).toEqual([]);
    });

    it("returns 409 when status is installing", async () => {
      h.state.set({ status: "installing" });
      const res = await h.app.inject({ method: "POST", url: "/api/bootstrap/retry" });
      expect(res.statusCode).toBe(409);
      expect(h.retryCalls).toEqual([]);
    });

    it("returns 202 when status is failed and invokes the trigger", async () => {
      h.state.set({ status: "failed", error: { message: "network" } });
      const res = await h.app.inject({ method: "POST", url: "/api/bootstrap/retry" });
      expect(res.statusCode).toBe(202);
      const body = res.json() as { ticketId: string };
      await new Promise((r) => setImmediate(r));
      expect(h.retryCalls).toEqual([body.ticketId]);
    });
  });
});
