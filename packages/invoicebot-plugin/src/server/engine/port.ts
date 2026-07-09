/**
 * InvoiceEngine port — the ONLY surface the routes depend on.
 *
 * The four methods mirror the four `ib_*` selectors. Each takes the request
 * `cwd` (the workspace key — the engine resolves it to a state dir behind this
 * port) plus the tool args (`view` for query; `action` for review/setup/rules).
 * The return is the raw tool result (`content` + `details`, verified against the
 * invoice-bot engine source), OPTIONALLY carrying a captured `flow` spec for the
 * five flow-triggering ops — the port does the DB side effect and hands the flow
 * to the plugin to dispatch (there is no in-process session bus).
 *
 * Two bindings implement it: `RealInvoiceEngine` (facade over the invoice-bot
 * `file:` link) and `FakeInvoiceEngine` (fixtures for CI / worktrees). Swapping
 * the binding (fake↔real, or file-link→published/vendored) requires NO route
 * change. See change: add-invoicebot-rest-plugin (Decision 0).
 */

/** A pi-flows flow to run (the five flow-triggering ops emit this in-session). */
export interface FlowRunSpec {
  flowName: string;
  task?: string;
  inputs?: Record<string, unknown>;
}

/** The raw `ib_*` tool result, plus any captured flow the plugin must dispatch. */
export interface EngineResult {
  content: { type: "text"; text: string }[];
  details: Record<string, unknown> & { ok?: boolean };
  /** Present only for the five flow-triggering ops (see routes.ts). */
  flow?: FlowRunSpec;
}

export interface InvoiceEngine {
  /** `ib_query` — read-only views. Never mutates, never a flow. */
  query(cwd: string, args: { view: string; [k: string]: unknown }): Promise<EngineResult>;
  /** `ib_review` — operational writes; approve/repair/submit/partner-confirm carry `flow`. */
  review(cwd: string, args: { action: string; [k: string]: unknown }): Promise<EngineResult>;
  /** `ib_setup` — editor config. Pure (no flow). */
  setup(cwd: string, args: { action: string; [k: string]: unknown }): Promise<EngineResult>;
  /** `ib_rules` — rule authoring; `request` carries `flow` (add-rule), rest pure. */
  rules(cwd: string, args: { action: string; [k: string]: unknown }): Promise<EngineResult>;
}

/** A tag every binding sets so plugin load can log which engine is active. */
export interface BoundEngine {
  engine: InvoiceEngine;
  binding: "real" | "fake";
}
