/**
 * Bootstrap REST API routes: `/api/bootstrap/status`, `/api/bootstrap/upgrade-pi`,
 * `/api/bootstrap/retry`.
 *
 * The routes are thin — they read/write the injected `BootstrapStateStore`
 * and delegate actual install work to the supplied `trigger` callbacks.
 * Keeping triggers as callbacks lets the CLI wire them to `bootstrapInstall`
 * while tests wire them to mocks.
 *
 * See change: unified-bootstrap-install.
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { BootstrapStateStore } from "../bootstrap-state.js";
import type { NetworkGuard } from "./route-deps.js";

export interface BootstrapRouteDeps {
  bootstrapState: BootstrapStateStore;
  networkGuard: NetworkGuard;
  /**
   * Trigger a pi upgrade. Called when `POST /api/bootstrap/upgrade-pi`
   * succeeds the 409-gate. Implementation is responsible for setting
   * state to "installing" before returning, and to "ready"/"failed"
   * when complete. Must NOT throw synchronously.
   */
  triggerUpgradePi: (ticketId: string) => Promise<void>;
  /**
   * Trigger a retry of the last bootstrap install. Called when
   * `POST /api/bootstrap/retry` succeeds the 409-gate. Implementation
   * should re-run the same install that failed and flip status back to
   * "installing" before returning.
   */
  triggerRetry: (ticketId: string) => Promise<void>;
}

export function registerBootstrapRoutes(
  fastify: FastifyInstance,
  deps: BootstrapRouteDeps,
): void {
  const { bootstrapState, networkGuard, triggerUpgradePi, triggerRetry } = deps;

  fastify.get(
    "/api/bootstrap/status",
    { preHandler: networkGuard },
    async () => {
      return bootstrapState.get();
    },
  );

  fastify.post(
    "/api/bootstrap/upgrade-pi",
    { preHandler: networkGuard },
    async (_request, reply) => {
      const current = bootstrapState.get();
      if (current.status === "installing") {
        return reply.code(409).send({
          error: "bootstrap is currently installing; try again when status becomes ready or failed",
          status: current.status,
        });
      }
      const ticketId = randomUUID();
      // Fire-and-forget. Errors flow through state.
      void triggerUpgradePi(ticketId).catch((err) => {
        console.error("[bootstrap-routes] upgrade-pi trigger failed:", err);
      });
      return reply.code(202).send({ ticketId, status: "accepted" });
    },
  );

  fastify.post(
    "/api/bootstrap/retry",
    { preHandler: networkGuard },
    async (_request, reply) => {
      const current = bootstrapState.get();
      if (current.status !== "failed") {
        return reply.code(409).send({
          error: "retry is only valid when status is failed",
          status: current.status,
        });
      }
      const ticketId = randomUUID();
      void triggerRetry(ticketId).catch((err) => {
        console.error("[bootstrap-routes] retry trigger failed:", err);
      });
      return reply.code(202).send({ ticketId, status: "accepted" });
    },
  );
}
