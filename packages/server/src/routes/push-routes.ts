/**
 * Push device-management REST routes (auth-gated via `networkGuard`). Routes
 * stay mounted for runtime config changes and return 404 while
 * `config.push.enabled` is false (opt-in by default).
 *
 *   POST   /api/push/register            { deviceToken, transport, sessionFilter? } → 200 { tokenId }
 *   DELETE /api/push/register/:tokenId                                              → 204
 *   POST   /api/push/test                { tokenId? }                              → 200 { results }
 *   GET    /api/push/vapid-public-key                                              → 200 { publicKey }
 *
 * See change: add-server-push-notifications.
 */

import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { FastifyInstance } from "fastify";
import { buildPushPayload } from "../push/build-push-payload.js";
import type { PushToken, PushTokenRegistry } from "../push/push-token-registry.js";
import type { PushTransport, PushTransportKind } from "../push/push-transports/types.js";
import type { NetworkGuard } from "./route-deps.js";

export interface PushRoutesDeps {
  networkGuard: NetworkGuard;
  registry: PushTokenRegistry;
  transports: Partial<Record<PushTransportKind, PushTransport>>;
  getVapidPublicKey: () => string;
  /** Resolve a session for the test-notification payload. */
  getSession: (sessionId: string) => DashboardSession | undefined;
  /** Live master gate; disabled routes return 404 without unregistering Fastify paths. */
  isEnabled?: () => boolean;
}

const VALID_TRANSPORTS: ReadonlySet<string> = new Set<PushTransportKind>(["web-push", "fcm"]);

/** Send a single test notification, mirroring the dispatcher's send path. */
async function sendTest(
  token: PushToken,
  transports: PushRoutesDeps["transports"],
  getSession: PushRoutesDeps["getSession"],
): Promise<{ tokenId: string; ok: boolean; gone?: boolean }> {
  const transport = transports[token.transport];
  if (!transport) return { tokenId: token.id, ok: false };
  // Synthetic session so the test push renders even with no live session.
  const session =
    getSession(token.sessionFilter?.[0] ?? "test") ??
    ({ id: "test", cwd: "/", source: "tui", status: "idle", startedAt: 0, name: "Test push" } as DashboardSession);
  const payload = buildPushPayload(session, { eventType: "agent_end", timestamp: Date.now(), data: {} });
  try {
    const res = await transport.send(token, payload);
    return { tokenId: token.id, ok: res.ok, ...(res.gone ? { gone: true } : {}) };
  } catch {
    return { tokenId: token.id, ok: false };
  }
}

export function registerPushRoutes(fastify: FastifyInstance, deps: PushRoutesDeps): void {
  const { networkGuard, registry, transports, getVapidPublicKey, getSession, isEnabled = () => true } = deps;

  // ── GET vapid public key ─────────────────────────────────────
  fastify.get("/api/push/vapid-public-key", { preHandler: networkGuard }, async (_request, reply) => {
    if (!isEnabled()) return reply.code(404).send({ error: "push disabled" });
    return { publicKey: getVapidPublicKey() };
  });

  // ── POST register ────────────────────────────────────────────
  fastify.post<{
    Body: { deviceToken?: unknown; transport?: unknown; sessionFilter?: unknown };
  }>("/api/push/register", { preHandler: networkGuard }, async (request, reply) => {
    if (!isEnabled()) return reply.code(404).send({ error: "push disabled" });
    const body = request.body ?? {};
    const deviceToken = typeof body.deviceToken === "string" ? body.deviceToken : "";
    const transport = typeof body.transport === "string" ? body.transport : "";
    if (!deviceToken || !VALID_TRANSPORTS.has(transport)) {
      reply.code(400);
      return { error: "deviceToken and a valid transport ('web-push' | 'fcm') are required" };
    }
    const sessionFilter =
      Array.isArray(body.sessionFilter) && body.sessionFilter.every((s) => typeof s === "string")
        ? (body.sessionFilter as string[])
        : undefined;
    const token = registry.add({
      deviceToken,
      transport: transport as PushTransportKind,
      ...(sessionFilter ? { sessionFilter } : {}),
    });
    return { tokenId: token.id };
  });

  // ── DELETE register/:tokenId ─────────────────────────────────
  fastify.delete<{ Params: { tokenId: string } }>(
    "/api/push/register/:tokenId",
    { preHandler: networkGuard },
    async (request, reply) => {
      if (!isEnabled()) return reply.code(404).send({ error: "push disabled" });
      registry.remove(request.params.tokenId);
      reply.code(204);
      return null;
    },
  );

  // ── POST test ────────────────────────────────────────────────
  fastify.post<{ Body: { tokenId?: unknown } }>(
    "/api/push/test",
    { preHandler: networkGuard },
    async (request, reply) => {
      if (!isEnabled()) return reply.code(404).send({ error: "push disabled" });
      const tokenId = typeof request.body?.tokenId === "string" ? request.body.tokenId : undefined;
      const all = registry.list();
      const targets = tokenId ? all.filter((t) => t.id === tokenId) : all;
      const results = await Promise.all(targets.map((t) => sendTest(t, transports, getSession)));
      return { results };
    },
  );
}
