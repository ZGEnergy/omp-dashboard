/**
 * Git operation REST API routes (localhost-only).
 */
import type { FastifyInstance } from "fastify";
import type { ApiResponse } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import type { NetworkGuard } from "./route-deps.js";
import {
  addWorktree,
  checkoutBranch,
  gitInit,
  isGitRepo,
  listBranches,
  listWorktrees,
  readHead,
  stashPop,
} from "../git-operations.js";
import { safeRealpathSync } from "../resolve-path.js";
import fs from "node:fs";

export function registerGitRoutes(fastify: FastifyInstance, deps: { networkGuard: NetworkGuard }) {
  const { networkGuard } = deps;
  fastify.get<{ Querystring: { cwd?: string } }>(
    "/api/git/branches",
    { preHandler: networkGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd parameter required" } satisfies ApiResponse;
      }
      if (!isGitRepo(cwd)) {
        return { success: false, error: "not a git repository" } satisfies ApiResponse;
      }
      try {
        const data = listBranches(cwd);
        return { success: true, data } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message ?? "failed to list branches" } satisfies ApiResponse;
      }
    },
  );

  fastify.post<{ Body: { cwd?: string; branch?: string; stash?: boolean } }>(
    "/api/git/checkout",
    { preHandler: networkGuard },
    async (request, reply) => {
      const { cwd, branch, stash } = request.body ?? {};
      if (!cwd || !branch) {
        reply.code(400);
        return { success: false, error: "cwd and branch required" } satisfies ApiResponse;
      }
      try {
        const result = checkoutBranch(cwd, branch, stash ?? false);
        if (!result.success) {
          reply.code(409);
          return result;
        }
        return { success: true, data: { stashed: result.stashed } } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message ?? "checkout failed" } satisfies ApiResponse;
      }
    },
  );

  fastify.post<{ Body: { cwd?: string } }>(
    "/api/git/init",
    { preHandler: networkGuard },
    async (request, reply) => {
      const { cwd } = request.body ?? {};
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd required" } satisfies ApiResponse;
      }
      try {
        gitInit(cwd);
        return { success: true } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message ?? "init failed" } satisfies ApiResponse;
      }
    },
  );

  // ── Worktree endpoints ─────────────────────────────────────────────────────────
  // See change: add-worktree-spawn-dialog.

  fastify.get<{ Querystring: { cwd?: string } }>(
    "/api/git/head",
    { preHandler: networkGuard },
    async (request, reply) => {
      const validated = validateCwd(request.query.cwd);
      if (!validated.ok) {
        reply.code(400);
        return { success: false, code: validated.code, error: validated.message } satisfies ApiResponse;
      }
      if (!isGitRepo(validated.cwd)) {
        return { success: false, code: "not_a_repo", error: "not a git repository" } satisfies ApiResponse;
      }
      try {
        const head = readHead(validated.cwd);
        return { success: true, data: head } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, code: "git_failed", error: err?.message ?? "failed to read HEAD" } satisfies ApiResponse;
      }
    },
  );

  fastify.get<{ Querystring: { cwd?: string } }>(
    "/api/git/worktrees",
    { preHandler: networkGuard },
    async (request, reply) => {
      const validated = validateCwd(request.query.cwd);
      if (!validated.ok) {
        reply.code(400);
        return { success: false, code: validated.code, error: validated.message } satisfies ApiResponse;
      }
      if (!isGitRepo(validated.cwd)) {
        return { success: false, code: "not_a_repo", error: "not a git repository" } satisfies ApiResponse;
      }
      try {
        const worktrees = listWorktrees(validated.cwd);
        return { success: true, data: { worktrees } } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, code: "git_failed", error: err?.message ?? "failed to list worktrees" } satisfies ApiResponse;
      }
    },
  );

  fastify.post<{
    Body: { cwd?: string; base?: string; newBranch?: string; path?: string; force?: boolean };
  }>(
    "/api/git/worktree",
    { preHandler: networkGuard },
    async (request, reply) => {
      const body = request.body ?? {};
      const validated = validateCwd(body.cwd);
      if (!validated.ok) {
        reply.code(400);
        return { success: false, code: validated.code, error: validated.message } satisfies ApiResponse;
      }
      if (!body.base || typeof body.base !== "string") {
        reply.code(400);
        return { success: false, code: "cwd_invalid", error: "base required" } satisfies ApiResponse;
      }
      if (!body.newBranch || typeof body.newBranch !== "string") {
        reply.code(400);
        return { success: false, code: "cwd_invalid", error: "newBranch required" } satisfies ApiResponse;
      }
      const result = addWorktree({
        cwd: validated.cwd,
        base: body.base,
        newBranch: body.newBranch,
        path: body.path,
        force: body.force === true,
      });
      if (!result.ok) {
        // 409 for state conflicts that the client should surface inline
        // (branch already taken, path collision); 400 for input errors;
        // 500 for unclassified git failures.
        const httpStatus =
          result.error === "branch_in_use" || result.error === "branch_exists" || result.error === "path_exists"
            ? 409
            : result.error === "not_a_repo" || result.error === "base_not_found"
              ? 400
              : 500;
        reply.code(httpStatus);
        return {
          success: false,
          code: result.error,
          error: result.message,
          ...(result.stderr ? { stderr: result.stderr } : {}),
        } satisfies ApiResponse;
      }
      return {
        success: true,
        data: { path: result.path, branch: result.branch, excludeAppended: result.excludeAppended },
      } satisfies ApiResponse;
    },
  );

  fastify.post<{ Body: { cwd?: string } }>(
    "/api/git/stash-pop",
    { preHandler: networkGuard },
    async (request, reply) => {
      const { cwd } = request.body ?? {};
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd required" } satisfies ApiResponse;
      }
      try {
        const result = stashPop(cwd);
        return { success: true, data: result } satisfies ApiResponse;
      } catch (err: any) {
        return { success: false, error: err.message ?? "stash pop failed" } satisfies ApiResponse;
      }
    },
  );
}

/**
 * Validate and realpath a cwd query / body parameter for the worktree
 * endpoints. Returns either `{ ok: true, cwd }` (realpath-resolved) or
 * `{ ok: false, code, message }` with a stable error code.
 *
 * See change: add-worktree-spawn-dialog.
 */
function validateCwd(raw: string | undefined):
  | { ok: true; cwd: string }
  | { ok: false; code: "cwd_invalid"; message: string } {
  // (Field names: `code` is the stable classifier consumed by clients;
  // `message` is the human-readable string surfaced on the wire as
  // ApiResponse.error.)
  if (!raw || typeof raw !== "string") {
    return { ok: false, code: "cwd_invalid", message: "cwd required" };
  }
  const resolved = safeRealpathSync(raw);
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, code: "cwd_invalid", message: "cwd is not a directory" };
    }
  } catch {
    return { ok: false, code: "cwd_invalid", message: "cwd does not exist" };
  }
  return { ok: true, cwd: resolved };
}
