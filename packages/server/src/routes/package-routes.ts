/**
 * REST routes for pi package management: search, readme, installed, install, remove, update, check-updates.
 */
import type { FastifyInstance } from "fastify";
import type { ApiResponse } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { PackageManagerWrapper } from "../package-manager-wrapper.js";
import { PackageOperationBusyError } from "../package-manager-wrapper.js";
import { searchPackages, fetchReadme, PackageNotFoundError } from "../npm-search-proxy.js";

export function registerPackageRoutes(
  fastify: FastifyInstance,
  deps: {
    packageManagerWrapper: PackageManagerWrapper;
  },
) {
  const { packageManagerWrapper } = deps;

  // ── Search npm packages ─────────────────────────────────────────

  fastify.get<{ Querystring: { q?: string; type?: string } }>(
    "/api/packages/search",
    async (request) => {
      const { q, type } = request.query;
      try {
        const result = await searchPackages({ query: q, type });
        return { success: true, data: result } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message } satisfies ApiResponse;
      }
    },
  );

  // ── Fetch package README ────────────────────────────────────────

  fastify.get<{ Querystring: { pkg: string } }>(
    "/api/packages/readme",
    async (request, reply) => {
      const { pkg } = request.query;
      if (!pkg) {
        reply.code(400);
        return { success: false, error: "pkg parameter required" } satisfies ApiResponse;
      }
      try {
        const result = await fetchReadme(pkg);
        return { success: true, data: result } satisfies ApiResponse;
      } catch (err: any) {
        if (err instanceof PackageNotFoundError) {
          reply.code(404);
          return { success: false, error: err.message } satisfies ApiResponse;
        }
        return { success: false, error: err.message } satisfies ApiResponse;
      }
    },
  );

  // ── List installed packages ─────────────────────────────────────

  fastify.get<{ Querystring: { scope?: string; cwd?: string } }>(
    "/api/packages/installed",
    async (request) => {
      const scope = request.query.scope === "local" ? "local" : "global";
      const cwd = request.query.cwd;
      try {
        const packages = await packageManagerWrapper.listInstalled(scope, cwd);
        return { success: true, data: packages } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message } satisfies ApiResponse;
      }
    },
  );

  // ── Install package ─────────────────────────────────────────────

  fastify.post<{ Body: { source: string; scope: string; cwd?: string } }>(
    "/api/packages/install",
    async (request, reply) => {
      const { source, scope, cwd } = request.body ?? {};
      if (!source) {
        reply.code(400);
        return { success: false, error: "source is required" } satisfies ApiResponse;
      }
      const effectiveScope = scope === "local" ? "local" as const : "global" as const;
      try {
        const operationId = await packageManagerWrapper.run({
          action: "install",
          source,
          scope: effectiveScope,
          cwd,
        });
        reply.code(202);
        return { success: true, data: { operationId } } satisfies ApiResponse;
      } catch (err: any) {
        if (err instanceof PackageOperationBusyError) {
          reply.code(409);
          return { success: false, error: err.message } satisfies ApiResponse;
        }
        return { success: false, error: err.message } satisfies ApiResponse;
      }
    },
  );

  // ── Remove package ──────────────────────────────────────────────

  fastify.post<{ Body: { source: string; scope: string; cwd?: string } }>(
    "/api/packages/remove",
    async (request, reply) => {
      const { source, scope, cwd } = request.body ?? {};
      if (!source) {
        reply.code(400);
        return { success: false, error: "source is required" } satisfies ApiResponse;
      }
      const effectiveScope = scope === "local" ? "local" as const : "global" as const;
      try {
        const operationId = await packageManagerWrapper.run({
          action: "remove",
          source,
          scope: effectiveScope,
          cwd,
        });
        reply.code(202);
        return { success: true, data: { operationId } } satisfies ApiResponse;
      } catch (err: any) {
        if (err instanceof PackageOperationBusyError) {
          reply.code(409);
          return { success: false, error: err.message } satisfies ApiResponse;
        }
        return { success: false, error: err.message } satisfies ApiResponse;
      }
    },
  );

  // ── Update packages ─────────────────────────────────────────────

  fastify.post<{ Body: { source?: string; scope: string; cwd?: string } }>(
    "/api/packages/update",
    async (request, reply) => {
      const { source, scope, cwd } = request.body ?? {};
      const effectiveScope = scope === "local" ? "local" as const : "global" as const;
      try {
        const operationId = await packageManagerWrapper.run({
          action: "update",
          source: source ?? "",
          scope: effectiveScope,
          cwd,
        });
        reply.code(202);
        return { success: true, data: { operationId } } satisfies ApiResponse;
      } catch (err: any) {
        if (err instanceof PackageOperationBusyError) {
          reply.code(409);
          return { success: false, error: err.message } satisfies ApiResponse;
        }
        return { success: false, error: err.message } satisfies ApiResponse;
      }
    },
  );

  // ── Check for updates ───────────────────────────────────────────

  fastify.post<{ Body: { cwd?: string } }>(
    "/api/packages/check-updates",
    async (request) => {
      const { cwd } = request.body ?? {};
      try {
        const updates = await packageManagerWrapper.checkUpdates(cwd);
        return { success: true, data: updates } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message } satisfies ApiResponse;
      }
    },
  );
}
