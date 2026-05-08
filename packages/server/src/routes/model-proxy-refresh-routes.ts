/**
 * POST /api/model-proxy/refresh — force-refresh the model proxy registry.
 *
 * JWT-gated. Returns 200 on success, 503 if registry cannot be resolved.
 * See change: add-dashboard-model-proxy, task 2.9.
 */
import type { FastifyInstance } from "fastify";
import { refreshModelRegistry, getModelRegistry } from "../model-proxy/registry-singleton.js";

export function registerModelProxyRefreshRoutes(fastify: FastifyInstance): void {
  fastify.post("/api/model-proxy/refresh", async (_request, reply) => {
    try {
      // Ensure registry is initialized first, then refresh
      await getModelRegistry();
      await refreshModelRegistry();
      return { ok: true };
    } catch (err: any) {
      return reply.code(503).send({
        code: "MODEL_PROXY_RUNTIME_MISSING",
        message: err.message || "Failed to refresh model proxy registry",
      });
    }
  });
}
