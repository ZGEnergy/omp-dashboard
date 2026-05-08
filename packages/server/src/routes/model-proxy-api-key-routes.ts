/**
 * REST routes for proxy API key management.
 *
 *   GET    /api/model-proxy/api-keys           → list keys (redacted)
 *   POST   /api/model-proxy/api-keys           → create key (cleartext returned ONCE)
 *   POST   /api/model-proxy/api-keys/:id/revoke → soft-delete (set revokedAt)
 *   DELETE /api/model-proxy/api-keys/:id       → hard-delete (purge)
 *
 * All routes are JWT-gated (NOT proxy-key-gated — this is the management surface).
 *
 * See change: add-dashboard-model-proxy.
 */
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ProxyApiKey } from "@blackbelt-technology/pi-dashboard-shared/config.js";
import type { NetworkGuard } from "./route-deps.js";
import { generateKey, hashKey } from "../model-proxy/api-key-store.js";

export interface ApiKeyRoutesDeps {
  networkGuard: NetworkGuard;
  getModelProxyConfig: () => import("@blackbelt-technology/pi-dashboard-shared/config.js").ModelProxyConfig;
  writeModelProxyApiKeys: (apiKeys: ProxyApiKey[]) => Promise<void>;
  getAdminEmail?: () => string | undefined;
}

function getUserEmail(request: any): string | undefined {
  return request.user?.email;
}

export function registerModelProxyApiKeyRoutes(
  fastify: FastifyInstance,
  deps: ApiKeyRoutesDeps,
): void {
  const { networkGuard, getModelProxyConfig, writeModelProxyApiKeys, getAdminEmail } = deps;

  // ── GET /api/model-proxy/api-keys ─────────────────────────────────
  fastify.get(
    "/api/model-proxy/api-keys",
    { preHandler: networkGuard },
    async (request) => {
      const config = getModelProxyConfig();
      const userEmail = getUserEmail(request);
      const adminEmail = getAdminEmail?.();
      const isAdmin = adminEmail != null && userEmail === adminEmail;

      const filtered = config.apiKeys.filter(
        (k) => isAdmin || !k.createdBy || k.createdBy === userEmail,
      );

      const active = filtered
        .filter((k) => k.revokedAt == null)
        .map((k) => ({ ...k, hash: "***" }));
      const revoked = filtered
        .filter((k) => k.revokedAt != null)
        .map((k) => ({ ...k, hash: "***" }));

      return { success: true, data: { keys: active, revoked } };
    },
  );

  // ── POST /api/model-proxy/api-keys ────────────────────────────────
  fastify.post(
    "/api/model-proxy/api-keys",
    { preHandler: networkGuard },
    async (request, reply) => {
      const body = request.body as any;
      if (!body || typeof body.label !== "string" || !body.label.trim()) {
        return reply.code(400).send({ success: false, error: "label is required" });
      }

      const scopes: string[] = Array.isArray(body.scopes) ? body.scopes : ["all"];
      const expiresAt: number | undefined =
        typeof body.expiresAt === "number" ? body.expiresAt : undefined;

      if (expiresAt != null && expiresAt <= Date.now()) {
        return reply.code(400).send({ success: false, error: "expiresAt must be in the future" });
      }

      const cleartext = generateKey();
      const hash = hashKey(cleartext);
      const userEmail = getUserEmail(request);

      const entry: ProxyApiKey = {
        id: crypto.randomUUID(),
        label: body.label.trim(),
        hash,
        createdAt: Date.now(),
        ...(userEmail ? { createdBy: userEmail } : {}),
        scopes,
        ...(expiresAt != null ? { expiresAt } : {}),
      };

      const config = getModelProxyConfig();
      await writeModelProxyApiKeys([...config.apiKeys, entry]);

      return reply.code(201).send({
        success: true,
        data: {
          id: entry.id,
          label: entry.label,
          createdBy: entry.createdBy,
          scopes: entry.scopes ?? ["all"],
          createdAt: entry.createdAt,
          ...(entry.expiresAt != null ? { expiresAt: entry.expiresAt } : {}),
          key: cleartext, // revealed ONCE
        },
      });
    },
  );

  // ── POST /api/model-proxy/api-keys/:id/revoke ─────────────────────
  fastify.post(
    "/api/model-proxy/api-keys/:id/revoke",
    { preHandler: networkGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const config = getModelProxyConfig();
      const entry = config.apiKeys.find((k) => k.id === id);

      if (!entry) {
        return reply.code(404).send({ success: false, error: "Key not found" });
      }

      const userEmail = getUserEmail(request);
      const adminEmail = getAdminEmail?.();
      const isAdmin = adminEmail != null && userEmail === adminEmail;

      if (!isAdmin && entry.createdBy && entry.createdBy !== userEmail) {
        return reply.code(403).send({ success: false, error: "Not authorized to revoke this key" });
      }

      const updated = config.apiKeys.map((k) =>
        k.id === id ? { ...k, revokedAt: Date.now() } : k,
      );
      await writeModelProxyApiKeys(updated);

      return reply.code(204).send();
    },
  );

  // ── DELETE /api/model-proxy/api-keys/:id ──────────────────────────
  fastify.delete(
    "/api/model-proxy/api-keys/:id",
    { preHandler: networkGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const config = getModelProxyConfig();
      const entry = config.apiKeys.find((k) => k.id === id);

      if (!entry) {
        return reply.code(404).send({ success: false, error: "Key not found" });
      }

      const userEmail = getUserEmail(request);
      const adminEmail = getAdminEmail?.();
      const isAdmin = adminEmail != null && userEmail === adminEmail;

      if (!isAdmin && entry.createdBy && entry.createdBy !== userEmail) {
        return reply.code(403).send({ success: false, error: "Not authorized to delete this key" });
      }

      const filtered = config.apiKeys.filter((k) => k.id !== id);
      await writeModelProxyApiKeys(filtered);

      return reply.code(204).send();
    },
  );
}
