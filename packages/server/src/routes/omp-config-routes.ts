/**
 * REST surface for OMP agent settings (`omp config` CLI).
 *
 * Auth posture matches `/api/config` — dashboard session via networkGuard.
 */

import { resolveOmpAgentDir } from "@blackbelt-technology/pi-dashboard-shared/omp-agent-paths.js";
import type { FastifyInstance } from "fastify";
import {
  createOmpConfigCli,
  type OmpConfigCli,
  OmpConfigCliError,
  type OmpConfigEntry,
} from "../omp-config-cli.js";
import type { NetworkGuard } from "./route-deps.js";

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

function asModelRoles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [role, model] of Object.entries(value)) {
    if (typeof model === "string" && model.trim()) out[role] = model.trim();
  }
  return out;
}

function asRolePatch(value: unknown): Record<string, string | null> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string | null> = {};
  for (const [role, model] of Object.entries(value)) {
    if (typeof model === "string") out[role] = model;
    else if (model === null) out[role] = null;
    else return null;
  }
  return out;
}

export function registerOmpConfigRoutes(
  fastify: FastifyInstance,
  deps: OmpConfigRouteDeps,
): void {
  const { networkGuard } = deps;
  const cli = deps.cli ?? createOmpConfigCli();
  // `modelRoles` is a whole-record OMP setting. Serialize read-merge-write
  // patches so simultaneous Roles and Sessions default-model saves cannot
  // clobber one another.
  let modelRolesTail: Promise<void> = Promise.resolve();

  const patchModelRoles = async (patch: Record<string, string | null>): Promise<OmpConfigEntry> => {
    let resolveResult: (entry: OmpConfigEntry) => void = () => {};
    let rejectResult: (reason: unknown) => void = () => {};
    const result = new Promise<OmpConfigEntry>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    modelRolesTail = modelRolesTail
      .catch(() => undefined)
      .then(async () => {
        try {
          const current = asModelRoles((await cli.get("modelRoles")).value);
          for (const [role, model] of Object.entries(patch)) {
            if (model == null || model.trim() === "") delete current[role];
            else current[role] = model.trim();
          }
          resolveResult(await cli.set("modelRoles", current));
        } catch (err) {
          rejectResult(err);
        }
      });
    return result;
  };

  fastify.get(
    "/api/omp-config",
    { preHandler: networkGuard },
    async (_request, reply) => {
      try {
        const [settings, agentDir, ompBin, ompVersion] = await Promise.all([
          cli.list(),
          cli.path().catch(() => resolveOmpAgentDir()),
          Promise.resolve(cli.resolveBin()),
          cli.version().catch(() => null),
        ]);
        return {
          success: true,
          data: {
            agentDir,
            settings,
            ompBin,
            ompVersion,
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

  fastify.patch<{ Body: { patch?: unknown } }>(
    "/api/omp-config/model-roles",
    { preHandler: networkGuard },
    async (request, reply) => {
      const patch = asRolePatch(request.body?.patch);
      if (!patch) {
        return reply.status(400).send({
          success: false,
          error: "Body must include a modelRoles patch of string or null values",
          code: "OMP_INVALID_KEY",
        });
      }
      try {
        return { success: true, data: await patchModelRoles(patch) };
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
