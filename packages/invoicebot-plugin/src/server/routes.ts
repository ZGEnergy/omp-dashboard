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
 *   GET  /api/plugins/invoicebot/blob    → stream a retained original document
 *
 * The plugin forwards `{ selector, ...args }` to the matching `InvoiceEngine`
 * port method and normalizes the tool result to `{ ok, text, data, sessionId?,
 * consequential? }`. For the five flow-triggering ops (the engine returns a
 * `flow` spec) the route dispatches `flow:run` into the workspace session and
 * attaches the resulting `sessionId`. See change: add-invoicebot-rest-plugin.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { FastifyInstance } from "fastify";
import { contentTypeFor, resolveBlobPath } from "./blob.js";
import type { EngineResult, FlowRunSpec, InvoiceEngine } from "./engine/port.js";

/** Parse a single-range `Range: bytes=start-end` header against a known size. */
function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | "none" | "unsatisfiable" {
  if (!header) return "none";
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return "unsatisfiable";
  const [, startRaw, endRaw] = m;
  let start: number;
  let end: number;
  if (startRaw === "") {
    // suffix range: last N bytes
    if (endRaw === "") return "unsatisfiable";
    const n = Number(endRaw);
    if (n === 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? size - 1 : Number(endRaw);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return "unsatisfiable";
  }
  return { start, end: Math.min(end, size - 1) };
}

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

  // ── /blob — GET byte delivery of a retained original (design D1) ───────────
  // Breaks the POST-envelope convention deliberately: the browser's native
  // PDF/image viewer needs a plain GET URL it can put in <iframe src>/<img src>
  // and issue Range against. Path-traversal-guarded via resolveBlobPath.
  fastify.get("/api/plugins/invoicebot/blob", async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, unknown>;
    const resolved = resolveBlobPath(q.cwd, q.handle);
    if (!resolved.ok) {
      const code = resolved.reason === "invalid-input" ? 400 : resolved.reason === "traversal" ? 403 : 404;
      req.log.info({ reason: resolved.reason, code }, "invoicebot blob rejected");
      reply.code(code);
      return { error: resolved.reason };
    }

    const { abs } = resolved;
    const size = statSync(abs).size;
    const name = basename(abs);
    reply
      .header("Content-Type", contentTypeFor(abs))
      .header("Content-Disposition", `inline; filename="${name.replace(/"/g, "")}"`)
      .header("Accept-Ranges", "bytes")
      .header("X-Content-Type-Options", "nosniff");

    const range = parseRange(req.headers.range, size);
    if (range === "unsatisfiable") {
      req.log.info({ handle: name, code: 416 }, "invoicebot blob range unsatisfiable");
      reply.code(416).header("Content-Range", `bytes */${size}`);
      return reply.send();
    }
    if (range === "none") {
      req.log.info({ handle: name, code: 200 }, "invoicebot blob served");
      reply.code(200).header("Content-Length", String(size));
      return reply.send(createReadStream(abs));
    }
    const { start, end } = range;
    req.log.info({ handle: name, code: 206, start, end }, "invoicebot blob partial");
    reply
      .code(206)
      .header("Content-Range", `bytes ${start}-${end}/${size}`)
      .header("Content-Length", String(end - start + 1));
    return reply.send(createReadStream(abs, { start, end }));
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
