/**
 * HTTP-level tests for the push device-management routes.
 *
 * Covers: register→200 {tokenId}, delete→204, test with no tokens→200
 * {results:[]}, test with a token→200 {results:[{tokenId, ok}]},
 * vapid-public-key→200 {publicKey}, and 401 auth-gating via a rejecting guard.
 * Mirrors the goal-routes.test.ts harness (Fastify + inject + pass-through /
 * deny guard). See change: add-server-push-notifications.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPushTokenRegistry, type PushTokenRegistry } from "../push/push-token-registry.js";
import type { PushTransport } from "../push/push-transports/types.js";
import { registerPushRoutes } from "../routes/push-routes.js";
import type { NetworkGuard } from "../routes/route-deps.js";

const PASSTHRU: NetworkGuard = async () => {};
const DENY: NetworkGuard = async (_req, reply) => {
  reply.code(401).send({ error: "Authentication required" });
};

function fakeWebPush(): PushTransport & { send: any } {
  return { kind: "web-push", send: vi.fn(async () => ({ ok: true })) };
}

describe("push REST routes", () => {
  let dir: string;
  let registry: PushTokenRegistry;
  let fastify: FastifyInstance;
  let webPush: ReturnType<typeof fakeWebPush>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-routes-"));
    registry = createPushTokenRegistry({ path: path.join(dir, "push-tokens.json") });
    webPush = fakeWebPush();
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function setup(guard: NetworkGuard = PASSTHRU) {
    fastify = Fastify();
    registerPushRoutes(fastify, {
      networkGuard: guard,
      registry,
      transports: { "web-push": webPush },
      getVapidPublicKey: () => "VAPID_PUB",
      getSession: () => undefined,
    });
    await fastify.ready();
  }

  it("GET /api/push/vapid-public-key → 200 { publicKey }", async () => {
    await setup();
    const res = await fastify.inject({ method: "GET", url: "/api/push/vapid-public-key" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ publicKey: "VAPID_PUB" });
  });

  it("POST /api/push/register → 200 { tokenId }", async () => {
    await setup();
    const res = await fastify.inject({
      method: "POST",
      url: "/api/push/register",
      payload: { deviceToken: "dev-A", transport: "web-push" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(typeof body.tokenId).toBe("string");
    expect(registry.list()).toHaveLength(1);
  });

  it("POST /api/push/register → 400 on invalid transport", async () => {
    await setup();
    const res = await fastify.inject({
      method: "POST",
      url: "/api/push/register",
      payload: { deviceToken: "dev-A", transport: "carrier-pigeon" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /api/push/register/:tokenId → 204", async () => {
    await setup();
    const token = registry.add({ deviceToken: "dev-A", transport: "web-push" });
    const res = await fastify.inject({ method: "DELETE", url: `/api/push/register/${token.id}` });
    expect(res.statusCode).toBe(204);
    expect(registry.list()).toHaveLength(0);
  });

  it("POST /api/push/test with no tokens → 200 { results: [] }", async () => {
    await setup();
    const res = await fastify.inject({ method: "POST", url: "/api/push/test", payload: {} });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ results: [] });
  });

  it("POST /api/push/test with a registered token → 200 { results: [{tokenId, ok}] }", async () => {
    await setup();
    const token = registry.add({ deviceToken: "dev-A", transport: "web-push" });
    const res = await fastify.inject({ method: "POST", url: "/api/push/test", payload: {} });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toEqual([{ tokenId: token.id, ok: true }]);
    expect(webPush.send).toHaveBeenCalledTimes(1);
  });

  it("rejects with 401 when the guard denies (auth-gating)", async () => {
    await setup(DENY);
    for (const [method, url] of [
      ["GET", "/api/push/vapid-public-key"],
      ["POST", "/api/push/register"],
      ["DELETE", "/api/push/register/x"],
      ["POST", "/api/push/test"],
    ] as const) {
      const res = await fastify.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(401);
    }
  });
});
