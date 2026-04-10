/**
 * File, directory browse, and README REST API routes (localhost-only).
 */
import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../memory-session-manager.js";
import type { PreferencesStore } from "../preferences-store.js";
import type { ApiResponse } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { NetworkGuard } from "./route-deps.js";
import { listDirectories } from "../browse.js";
import path from "node:path";
import fs from "node:fs/promises";

export function registerFileRoutes(
  fastify: FastifyInstance,
  deps: {
    sessionManager: SessionManager;
    preferencesStore: PreferencesStore;
    networkGuard: NetworkGuard;
  },
) {
  const { sessionManager, preferencesStore, networkGuard } = deps;

  // Directory browse endpoint
  fastify.get<{ Querystring: { path?: string } }>(
    "/api/browse",
    { preHandler: networkGuard },
    async (request) => {
      try {
        const result = await listDirectories(request.query.path || undefined);
        return { success: true, data: result } satisfies ApiResponse;
      } catch {
        return { success: false, error: "directory not found" } satisfies ApiResponse;
      }
    },
  );

  // File read endpoint — read file content or list directory
  fastify.get<{ Querystring: { cwd?: string; path?: string } }>(
    "/api/file",
    { preHandler: networkGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      const relPath = request.query.path;
      if (!cwd || !relPath) {
        reply.code(400);
        return { success: false, error: "cwd and path parameters required" } satisfies ApiResponse;
      }

      const allSessions = sessionManager.listAll();
      if (!allSessions.some((s) => s.cwd === cwd)) {
        reply.code(403);
        return { success: false, error: "unknown session path" } satisfies ApiResponse;
      }

      const resolved = path.resolve(cwd, relPath);
      if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
        reply.code(403);
        return { success: false, error: "path outside working directory" } satisfies ApiResponse;
      }

      try {
        const stat = await fs.stat(resolved);
        if (stat.isDirectory()) {
          const entries = await fs.readdir(resolved);
          entries.sort();
          return { success: true, data: { type: "directory", entries } } satisfies ApiResponse;
        }
        const content = await fs.readFile(resolved, "utf-8");
        return { success: true, data: { type: "file", content } } satisfies ApiResponse;
      } catch {
        reply.code(404);
        return { success: false, error: "not found" } satisfies ApiResponse;
      }
    },
  );

  // README endpoint — read README.md from a directory
  fastify.get<{ Querystring: { cwd?: string; check?: string } }>(
    "/api/readme",
    { preHandler: networkGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd parameter required" } satisfies ApiResponse;
      }

      const allSessions = sessionManager.listAll();
      const knownCwds = new Set(allSessions.map((s) => s.cwd));
      for (const dir of preferencesStore.getPinnedDirectories()) knownCwds.add(dir);

      if (!knownCwds.has(cwd)) {
        reply.code(403);
        return { success: false, error: "unknown directory" } satisfies ApiResponse;
      }

      const readmePath = path.join(cwd, "README.md");
      try {
        if (request.query.check) {
          await fs.access(readmePath);
          return { success: true, data: { exists: true } } satisfies ApiResponse;
        }
        const content = await fs.readFile(readmePath, "utf-8");
        return { success: true, data: { content } } satisfies ApiResponse;
      } catch {
        reply.code(404);
        return { success: false, error: "README.md not found" } satisfies ApiResponse;
      }
    },
  );

  // Pinned directories endpoint
  fastify.get("/api/pinned-dirs", async () => {
    return { success: true, data: preferencesStore.getPinnedDirectories() } satisfies ApiResponse;
  });
}
