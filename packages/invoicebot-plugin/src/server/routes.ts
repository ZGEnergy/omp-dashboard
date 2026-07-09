/**
 * REST routes for the invoicebot-plugin, mounted under
 * `/api/plugins/invoicebot/*`. Four POST endpoints, each wrapping one `ib_*`
 * selector, keyed by `cwd` (the per-request workspace key). Auth is inherited
 * from the dashboard's `onRequest` hook on `fastify`.
 *
 *   POST /api/plugins/invoicebot/query   → ib_query  (view)
 *   POST /api/plugins/invoicebot/review  → ib_review (action)
 *   POST /api/plugins/invoicebot/setup   → ib_setup  (action)
 *   POST /api/plugins/invoicebot/rules   → ib_rules  (action)
 *
 * The plugin forwards `{ selector, ...args }` to the matching `InvoiceEngine`
 * port method and normalizes the tool result to `{ ok, text, data, sessionId?,
 * consequential? }`. For the five flow-triggering ops (the engine returns a
 * `flow` spec) the route dispatches `flow:run` into the workspace session and
 * attaches the resulting `sessionId`. See change: add-invoicebot-rest-plugin.
 */
import { existsSync, statSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { EngineResult, FlowRunSpec, InvoiceEngine } from "./engine/port.js";

export interface InvoiceBotRouteDeps {
  engine: InvoiceEngine;
  /** Dispatch a flow into the workspace session; returns the sessionId/token. */
  dispatchFlow: (args: { cwd: string; flow: FlowRunSpec; sessionId?: string; invoiceId?: string }) => Promise<string | undefined>;
}

/** Consequential ops the client MUST confirm first (api-contract §10). */
function isConsequential(endpoint: string, body: Record<string, unknown>): boolean {
  const a = body.action;
  if (endpoint === "review") return a === "approve" || a === "reject" || a === "repair" || (a === "handoff" && body.confirm === true);
  if (endpoint === "rules") return a === "approve" || a === "archive" || (a === "request" && body.consent === true);
  if (endpoint === "setup") return a === "config" && body.consent === true;
  return false;
}

/** Validate `cwd`: a non-empty absolute string, an existing directory, no NUL. */
function badCwd(cwd: unknown): string | null {
  if (typeof cwd !== "string" || cwd.trim() === "") return "cwd is required";
  if (cwd.includes("\0")) return "cwd is invalid";
  try {
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) return "cwd is not an existing directory";
  } catch {
    return "cwd is not an existing directory";
  }
  return null;
}

function normalize(
  result: EngineResult,
  extra: { sessionId?: string; consequential?: boolean } = {},
): Record<string, unknown> {
  const ok = result.details?.ok !== false;
  const text = result.content?.[0]?.text ?? "";
  return {
    ok,
    text,
    data: result.details,
    ...(extra.sessionId ? { sessionId: extra.sessionId } : {}),
    ...(extra.consequential ? { consequential: true } : {}),
  };
}

export function mountInvoiceBotRoutes(fastify: FastifyInstance, deps: InvoiceBotRouteDeps): void {
  const { engine, dispatchFlow } = deps;

  /** Dispatch the captured flow (if any) into the workspace session; returns the sessionId. */
  async function dispatchIfFlow(body: Record<string, unknown>, result: EngineResult): Promise<string | undefined> {
    if (!result.flow) return undefined;
    const args: { cwd: string; flow: FlowRunSpec; sessionId?: string; invoiceId?: string } = {
      cwd: body.cwd as string,
      flow: result.flow,
    };
    if (typeof body.sessionId === "string") args.sessionId = body.sessionId;
    if (typeof body.invoice_id === "string") args.invoiceId = body.invoice_id;
    return dispatchFlow(args);
  }

  // ── /query — reads (view) ──────────────────────────────────────────────────
  fastify.post("/api/plugins/invoicebot/query", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const cwdErr = badCwd(body.cwd);
    if (cwdErr) { reply.code(400); return { error: cwdErr }; }
    if (typeof body.view !== "string" || body.view.trim() === "") { reply.code(400); return { error: "view is required" }; }
    const result = await engine.query(body.cwd as string, body as { view: string });
    return normalize(result);
  });

  // ── /review — operational writes (action); some flow-triggering ────────────
  fastify.post("/api/plugins/invoicebot/review", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const cwdErr = badCwd(body.cwd);
    if (cwdErr) { reply.code(400); return { error: cwdErr }; }
    if (typeof body.action !== "string" || body.action.trim() === "") { reply.code(400); return { error: "action is required" }; }
    const result = await engine.review(body.cwd as string, body as { action: string });
    const sessionId = await dispatchIfFlow(body, result);
    return normalize(result, { ...(sessionId ? { sessionId } : {}), consequential: isConsequential("review", body) });
  });

  // ── /setup — editor config (action); pure ──────────────────────────────────
  fastify.post("/api/plugins/invoicebot/setup", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const cwdErr = badCwd(body.cwd);
    if (cwdErr) { reply.code(400); return { error: cwdErr }; }
    if (typeof body.action !== "string" || body.action.trim() === "") { reply.code(400); return { error: "action is required" }; }
    const result = await engine.setup(body.cwd as string, body as { action: string });
    return normalize(result, { consequential: isConsequential("setup", body) });
  });

  // ── /rules — rule authoring (action); request is flow-triggering ───────────
  fastify.post("/api/plugins/invoicebot/rules", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const cwdErr = badCwd(body.cwd);
    if (cwdErr) { reply.code(400); return { error: cwdErr }; }
    if (typeof body.action !== "string" || body.action.trim() === "") { reply.code(400); return { error: "action is required" }; }
    const result = await engine.rules(body.cwd as string, body as { action: string });
    const sessionId = await dispatchIfFlow(body, result);
    return normalize(result, { ...(sessionId ? { sessionId } : {}), consequential: isConsequential("rules", body) });
  });
}
