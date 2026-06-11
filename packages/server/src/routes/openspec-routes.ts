/**
 * OpenSpec and Pi Resources REST API routes (localhost-only).
 */
import type { FastifyInstance } from "fastify";
import type { SessionManager } from "../memory-session-manager.js";
import type { PreferencesStore } from "../preferences-store.js";
import type { DirectoryService } from "../directory-service.js";
import type { ApiResponse, OpenSpecConfig } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import {
  configListOr,
  configProfile,
  update as openspecUpdate,
  writeOpenSpecConfigFile,
  workflowSetSignature,
  EXPANDED_WORKFLOWS,
} from "@blackbelt-technology/pi-dashboard-shared/platform/openspec.js";
import type { NetworkGuard } from "./route-deps.js";
import { scanOpenSpecArchive } from "../openspec-archive.js";
import {
  readTasks,
  toggleTask,
  NotFoundError,
  LineMismatchError,
  NotACheckboxError,
} from "../openspec-tasks.js";
import path from "node:path";
import fs from "node:fs/promises";

/** Callback to broadcast an openspec_update after a successful toggle. */
export type OpenSpecBroadcaster = (cwd: string) => void;

export function registerOpenSpecRoutes(
  fastify: FastifyInstance,
  deps: {
    sessionManager: SessionManager;
    preferencesStore: PreferencesStore;
    directoryService: DirectoryService;
    networkGuard: NetworkGuard;
    /** Optional — called after a successful toggle to trigger openspec_update. */
    onOpenSpecChanged?: OpenSpecBroadcaster;
  },
) {
  const { sessionManager, preferencesStore, directoryService, networkGuard, onOpenSpecChanged } = deps;

  // OpenSpec workflow config endpoint — returns the user's enabled
  // workflow commands so the client can render only the buttons /
  // stepper nodes whose backing command is enabled.
  // See change: redesign-session-card-and-composer (config-driven-workflow).
  const configCache = new Map<string, { ts: number; data: OpenSpecConfig }>();
  const CONFIG_TTL_MS = 30_000;

  fastify.get<{ Querystring: { cwd?: string } }>(
    "/api/openspec/config",
    { preHandler: networkGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "Missing cwd" } satisfies ApiResponse;
      }
      const now = Date.now();
      const cached = configCache.get(cwd);
      if (cached && now - cached.ts < CONFIG_TTL_MS) {
        return { success: true, data: cached.data } satisfies ApiResponse;
      }
      const raw = configListOr({ cwd }, null) as Partial<OpenSpecConfig> | null;
      // Defensive normalisation: missing fields fall back to safe defaults
      // so the client always receives a well-formed OpenSpecConfig shape.
      const data: OpenSpecConfig = {
        profile: (raw?.profile as OpenSpecConfig["profile"]) ?? "custom",
        delivery: (raw?.delivery as OpenSpecConfig["delivery"]) ?? "both",
        workflows: Array.isArray(raw?.workflows) ? (raw!.workflows as string[]) : [],
      };
      configCache.set(cwd, { ts: now, data });
      return { success: true, data } satisfies ApiResponse;
    },
  );

  // ── add-openspec-profile-settings ─────────────────────────────────────
  // Known cwds = union(active session cwds, pinned dirs). Used by update-all
  // and update-status.
  function knownCwds(): string[] {
    const set = new Set<string>();
    for (const s of sessionManager.listAll()) if (s.cwd) set.add(s.cwd);
    for (const d of preferencesStore.getPinnedDirectories()) set.add(d);
    return [...set];
  }

  /** Current global workflow-set signature (drives staleness comparison). */
  function currentGlobalSignature(cwd: string): string {
    const raw = configListOr({ cwd }, null) as { workflows?: string[] } | null;
    return workflowSetSignature(Array.isArray(raw?.workflows) ? raw!.workflows! : []);
  }

  // POST /api/openspec/config — write the global OpenSpec workflow profile.
  // core → CLI preset; expanded/custom → atomic JSON write. Never mutates a
  // project repo and never runs `openspec update`.
  fastify.post<{ Body: { profile?: string; workflows?: string[]; cwd?: string } }>(
    "/api/openspec/config",
    { preHandler: networkGuard },
    async (request, reply) => {
      const body = request.body ?? {};
      const profile = body.profile;
      if (profile !== "core" && profile !== "expanded" && profile !== "custom") {
        reply.code(400);
        return { success: false, error: "invalid profile" } satisfies ApiResponse;
      }
      // cwd is only needed for the `core` preset invocation (CLI runs in a dir).
      const cwd = body.cwd ?? knownCwds()[0] ?? process.cwd();

      if (profile === "core") {
        const res = configProfile({ cwd, preset: "core" });
        if (!res.ok) {
          reply.code(500);
          return { success: false, error: "openspec config profile core failed" } satisfies ApiResponse;
        }
      } else {
        const workflows = profile === "expanded"
          ? [...EXPANDED_WORKFLOWS]
          : Array.isArray(body.workflows) ? body.workflows : [];
        const res = writeOpenSpecConfigFile({ profile, workflows });
        if (!res.success) {
          reply.code(500);
          return { success: false, error: res.error ?? "write failed" } satisfies ApiResponse;
        }
      }

      // Bust the 30s config cache so the next GET returns fresh data.
      configCache.clear();
      return { success: true } satisfies ApiResponse;
    },
  );

  // POST /api/openspec/update — run `openspec update` for one cwd or all.
  // Records the post-update workflow signature so staleness can be computed.
  fastify.post<{ Body: { cwd?: string; all?: boolean } }>(
    "/api/openspec/update",
    { preHandler: networkGuard },
    async (request, reply) => {
      const body = request.body ?? {};
      const targets = body.all ? knownCwds() : body.cwd ? [body.cwd] : [];
      if (targets.length === 0) {
        reply.code(400);
        return { success: false, error: "cwd or all required" } satisfies ApiResponse;
      }
      const results: Array<{ cwd: string; success: boolean; error?: string }> = [];
      for (const cwd of targets) {
        const res = openspecUpdate({ cwd });
        if (res.ok) {
          preferencesStore.setOpenSpecUpdateSignature(cwd, currentGlobalSignature(cwd));
          results.push({ cwd, success: true });
        } else {
          results.push({ cwd, success: false, error: "openspec update failed" });
        }
      }
      return { success: true, data: { results } } satisfies ApiResponse;
    },
  );

  // GET /api/openspec/update-status — per-cwd staleness vs current global config.
  fastify.get(
    "/api/openspec/update-status",
    { preHandler: networkGuard },
    async () => {
      const cwds = knownCwds();
      const statuses = cwds.map((cwd) => {
        const recorded = preferencesStore.getOpenSpecUpdateSignature(cwd);
        if (!recorded) return { cwd, status: "unknown" as const };
        const current = currentGlobalSignature(cwd);
        return { cwd, status: recorded === current ? ("up-to-date" as const) : ("needs-update" as const) };
      });
      return { success: true, data: { statuses } } satisfies ApiResponse;
    },
  );

  // OpenSpec archive listing endpoint
  fastify.get<{ Querystring: { cwd?: string } }>(
    "/api/openspec-archive",
    { preHandler: networkGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "Missing cwd" } satisfies ApiResponse;
      }
      const data = await scanOpenSpecArchive(cwd);
      return { success: true, data } satisfies ApiResponse;
    },
  );

  // Pi Resources endpoint — returns discovered extensions, skills, prompts
  fastify.get<{ Querystring: { cwd?: string; refresh?: string } }>(
    "/api/pi-resources",
    { preHandler: networkGuard },
    async (request, reply) => {
      const cwd = request.query.cwd;
      if (!cwd) {
        reply.code(400);
        return { success: false, error: "cwd parameter required" } satisfies ApiResponse;
      }
      // Bootstrap gate removed under change: eliminate-electron-runtime-install
      // (task 3.5). pi/openspec/tsx ship as regular npm deps; pi-resources
      // endpoint is unconditionally available.
      const forceRefresh = request.query.refresh === "true" || request.query.refresh === "1";
      let data = forceRefresh ? undefined : directoryService.getPiResources(cwd);
      if (!data) {
        data = await directoryService.refreshPiResources(cwd);
      }
      return { success: true, data } satisfies ApiResponse;
    },
  );

  // Pi Resource file endpoint — reads files from allowed pi resource locations
  fastify.get<{ Querystring: { path?: string } }>(
    "/api/pi-resource-file",
    { preHandler: networkGuard },
    async (request, reply) => {
      const filePath = request.query.path;
      if (!filePath) {
        reply.code(400);
        return { success: false, error: "path parameter required" } satisfies ApiResponse;
      }

      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const globalPiDir = path.join(homeDir, ".pi", "agent");
      const allSessions = sessionManager.listAll();
      const knownCwds = new Set(allSessions.map((s) => s.cwd));
      for (const dir of preferencesStore.getPinnedDirectories()) knownCwds.add(dir);

      const normalizedPath = path.resolve(filePath);
      const isAllowed =
        normalizedPath.startsWith(globalPiDir + path.sep) ||
        [...knownCwds].some(
          (cwd) => normalizedPath.startsWith(path.join(cwd, ".pi") + path.sep),
        ) ||
        normalizedPath.includes(path.join(".pi", "git") + path.sep) ||
        normalizedPath.includes("node_modules" + path.sep);

      if (!isAllowed) {
        reply.code(403);
        return { success: false, error: "path not in allowed resource location" } satisfies ApiResponse;
      }

      try {
        const content = await fs.readFile(normalizedPath, "utf-8");
        return { success: true, data: { type: "file", content } } satisfies ApiResponse;
      } catch {
        reply.code(404);
        return { success: false, error: "not found" } satisfies ApiResponse;
      }
    },
  );

  // --- Tasks.md list + toggle ---

  fastify.get<{ Querystring: { cwd?: string; change?: string } }>(
    "/api/openspec/tasks",
    { preHandler: networkGuard },
    async (request, reply) => {
      const { cwd, change } = request.query;
      if (!cwd || !change) {
        reply.code(400);
        return { success: false, error: "cwd and change query params required" } satisfies ApiResponse;
      }
      try {
        const tasks = await readTasks(cwd, change);
        const groups = Array.from(new Set(tasks.map((t) => t.group).filter((g) => g.length > 0)));
        return { success: true, data: { tasks, groups } } satisfies ApiResponse;
      } catch (err: any) {
        if (err instanceof NotFoundError) {
          reply.code(404);
          return { success: false, error: "tasks.md not found" } satisfies ApiResponse;
        }
        reply.code(500);
        return { success: false, error: err?.message ?? "read error" } satisfies ApiResponse;
      }
    },
  );

  fastify.post<{
    Body: { cwd?: string; change?: string; id?: string; done?: boolean; line?: number };
  }>(
    "/api/openspec/tasks/toggle",
    { preHandler: networkGuard },
    async (request, reply) => {
      const body = request.body ?? {};
      const { cwd, change, id, done, line } = body;
      if (
        typeof cwd !== "string" ||
        typeof change !== "string" ||
        typeof id !== "string" ||
        typeof done !== "boolean" ||
        typeof line !== "number"
      ) {
        reply.code(400);
        return { success: false, error: "invalid body" } satisfies ApiResponse;
      }
      try {
        const task = await toggleTask(cwd, change, id, done, line);
        // Fire-and-forget: refresh cache + broadcast openspec_update.
        directoryService.refreshOpenSpec(cwd).then(() => {
          onOpenSpecChanged?.(cwd);
        }).catch(() => {});
        return { success: true, data: { task } } satisfies ApiResponse;
      } catch (err: any) {
        if (err instanceof NotFoundError) {
          reply.code(404);
          return { success: false, error: "tasks.md not found" } satisfies ApiResponse;
        }
        if (err instanceof LineMismatchError) {
          reply.code(409);
          return { success: false, error: "line mismatch" } satisfies ApiResponse;
        }
        if (err instanceof NotACheckboxError) {
          reply.code(400);
          return { success: false, error: "target line is not a checkbox" } satisfies ApiResponse;
        }
        reply.code(500);
        return { success: false, error: err?.message ?? "toggle error" } satisfies ApiResponse;
      }
    },
  );
}
