/**
 * REST surface for OMP agent settings (`omp config` CLI).
 *
 * Auth posture matches `/api/config` — dashboard session via networkGuard.
 */
import type { FastifyInstance } from "fastify";
import type { NetworkGuard } from "./route-deps.js";
import {
  createOmpConfigCli,
  OmpConfigCliError,
  type OmpConfigCli,
  type OmpConfigEntry,
} from "../omp-config-cli.js";
import { resolveOmpAgentDir } from "@blackbelt-technology/pi-dashboard-shared/omp-agent-paths.js";

export interface OmpConfigRouteDeps {
  networkGuard: NetworkGuard;
  /** Injected for tests; defaults to live CLI wrapper. */
  cli?: OmpConfigCli;
}

function httpStatusFor(err: OmpConfigCliError): number {
  switch (err.code) {
    case "OMP_NOT_FOUND":
      return 503;
    case "OMP_INVALID_KEY":
      return 400;
    default:
      return 502;
  }
}

function sendCliError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: unknown,
) {
  if (err instanceof OmpConfigCliError) {
    return reply.status(httpStatusFor(err)).send({
      success: false,
      error: err.message,
      code: err.code,
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  return reply.status(502).send({ success: false, error: message, code: "OMP_CLI_FAILED" });
}

export function registerOmpConfigRoutes(
  fastify: FastifyInstance,
  deps: OmpConfigRouteDeps,
): void {
  const { networkGuard } = deps;
  const cli = deps.cli ?? createOmpConfigCli();

  fastify.get(
    "/api/omp-config",
    { preHandler: networkGuard },
    async (_request, reply) => {
      try {
        const [settings, agentDir] = await Promise.all([
          cli.list(),
          cli.path().catch(() => resolveOmpAgentDir()),
        ]);
        return {
          success: true,
          data: {
            agentDir,
            settings,
          },
        };
      } catch (err) {
        return sendCliError(reply, err);
      }
    },
  );

  fastify.get(
    "/api/omp-config/path",
    { preHandler: networkGuard },
    async (_request, reply) => {
      try {
        const agentDir = await cli.path();
        return { success: true, data: { agentDir } };
      } catch (err) {
        return sendCliError(reply, err);
      }
    },
  );

  fastify.get<{ Querystring: { key?: string } }>(
    "/api/omp-config/entry",
    { preHandler: networkGuard },
    async (request, reply) => {
      const key = request.query?.key?.trim();
      if (!key) {
        return reply.status(400).send({
          success: false,
          error: "Missing required query parameter: key",
          code: "OMP_INVALID_KEY",
        });
      }
      try {
        const entry = await cli.get(key);
        return { success: true, data: entry };
      } catch (err) {
        return sendCliError(reply, err);
      }
    },
  );

  fastify.put<{ Body: { key?: string; value?: unknown } }>(
    "/api/omp-config",
    { preHandler: networkGuard },
    async (request, reply) => {
      const body = request.body ?? {};
      const key = typeof body.key === "string" ? body.key.trim() : "";
      if (!key) {
        return reply.status(400).send({
          success: false,
          error: "Body must include non-empty string key",
          code: "OMP_INVALID_KEY",
        });
      }
      if (!("value" in body)) {
        return reply.status(400).send({
          success: false,
          error: "Body must include value",
          code: "OMP_INVALID_KEY",
        });
      }
      try {
        const entry: OmpConfigEntry = await cli.set(key, body.value);
        return { success: true, data: entry };
      } catch (err) {
        return sendCliError(reply, err);
      }
    },
  );

  fastify.post<{ Body: { key?: string } }>(
    "/api/omp-config/reset",
    { preHandler: networkGuard },
    async (request, reply) => {
      const key = typeof request.body?.key === "string" ? request.body.key.trim() : "";
      if (!key) {
        return reply.status(400).send({
          success: false,
          error: "Body must include non-empty string key",
          code: "OMP_INVALID_KEY",
        });
      }
      try {
        const entry = await cli.reset(key);
        return { success: true, data: entry };
      } catch (err) {
        return sendCliError(reply, err);
      }
    },
  );
}
