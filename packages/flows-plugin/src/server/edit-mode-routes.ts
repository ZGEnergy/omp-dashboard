/**
 * REST routes for the flows edit-mode setting (`flows.editFlow`).
 *
 *   GET /api/plugins/flows/edit-mode?cwd=<abs>
 *     → { project: boolean|null, global: boolean|null, effective: boolean }
 *   PUT /api/plugins/flows/edit-mode { cwd?, scope: "project"|"global", enabled }
 *     → same shape, post-write
 *
 * Reads/writes pi-flows' OWN settings files (project `<cwd>/.pi/settings.json`,
 * global `~/.pi/agent/settings.json`) with a format-preserving JSON merge —
 * the dashboard keeps no private copy. pi-flows resolves
 * `project ?? global ?? false` at session_start; `effective` mirrors that.
 *
 * Session-less by design: the folder settings toggle must work in a cwd with
 * zero connected sessions (author-first-flow bootstrap). Live application is
 * the client's job via the existing `POST /api/resources/reload`.
 *
 * See change: flows-edit-mode-folder-settings.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";

interface EditModeState {
  project: boolean | null;
  global: boolean | null;
  effective: boolean;
}

function settingsPath(scope: "project" | "global", cwd?: string): string {
  return scope === "project"
    ? path.join(cwd ?? process.cwd(), ".pi", "settings.json")
    : path.join(os.homedir(), ".pi", "agent", "settings.json");
}

/** Read `flows.editFlow` from a settings file; non-boolean/absent/unreadable → null. */
function readEditFlow(file: string): boolean | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
      flows?: { editFlow?: unknown };
    };
    const v = parsed?.flows?.editFlow;
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}

function readState(cwd?: string): EditModeState {
  const project = cwd ? readEditFlow(settingsPath("project", cwd)) : null;
  const globalFlag = readEditFlow(settingsPath("global"));
  return { project, global: globalFlag, effective: project ?? globalFlag ?? false };
}

/** Format-preserving merge of `flows.editFlow` into a settings file. */
function writeEditFlow(file: string, enabled: boolean): void {
  let root: Record<string, unknown> = {};
  try {
    root = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    // absent or unparseable → start fresh
  }
  const flows =
    typeof root.flows === "object" && root.flows !== null
      ? (root.flows as Record<string, unknown>)
      : {};
  flows.editFlow = enabled;
  root.flows = flows;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(root, null, 2)}\n`);
}

export function mountEditModeRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Querystring: { cwd?: string } }>(
    "/api/plugins/flows/edit-mode",
    async (req) => {
      // cwd optional: without it the read is global-only (project stays null) —
      // the global FlowsSettings section reads this shape.
      return { success: true, data: readState(req.query?.cwd) };
    },
  );

  fastify.put<{ Body: { cwd?: string; scope?: string; enabled?: boolean } }>(
    "/api/plugins/flows/edit-mode",
    async (req, reply) => {
      const body = req.body ?? {};
      const scope =
        body.scope === "project" ? "project" : body.scope === "global" ? "global" : null;
      if (!scope || typeof body.enabled !== "boolean") {
        reply.code(400);
        return { success: false, error: "scope must be 'project' or 'global', enabled must be boolean" };
      }
      if (scope === "project" && !body.cwd) {
        reply.code(400);
        return { success: false, error: "cwd required for project scope" };
      }
      writeEditFlow(settingsPath(scope, body.cwd), body.enabled);
      return { success: true, data: readState(body.cwd) };
    },
  );
}
