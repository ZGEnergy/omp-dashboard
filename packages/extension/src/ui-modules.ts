/**
 * Extension UI System — Phase 1 (management-modal slot).
 *
 * Implements the bridge side of the discovery probe and the
 * `ui_management` round-trip described in
 * `openspec/changes/add-extension-ui-modal/design.md` §4.
 *
 * Lifecycle (from `bridge.ts`):
 *   - `subscribeUiInvalidate(ctx)`  — once per session, attaches a single
 *                                     `ui:invalidate` listener that triggers
 *                                     a full re-probe.
 *   - `refreshUiModules(ctx)`       — fires the `ui:list-modules` probe and
 *                                     forwards the resulting array as a
 *                                     `ui_modules_list` protocol message.
 *                                     Called on `session_start` and after
 *                                     every reconnect.
 *   - `handleUiManagement(ctx,msg)` — receives `ui_management` from the
 *                                     server, re-emits to extensions on
 *                                     `pi.events`, and forwards any
 *                                     synchronous `data.items` back as a
 *                                     `ui_data_list` protocol message.
 *
 * The probe is **synchronous**: extensions push descriptors into
 * `probe.modules` while `pi.events.emit` runs. We never poll, never cache
 * across probes, and never register modules on the extension's behalf.
 *
 * No-dashboard fallback: when `connection` is not yet open, `ConnectionManager`
 * buffers the outgoing messages and flushes on connect. No extra guards are
 * needed here; the bridge's existing `sessionReady` gate is the upstream
 * trigger guard for `session_start`-driven probes.
 */
import type { ExtensionUiModule, DecoratorDescriptor } from "@blackbelt-technology/pi-dashboard-shared/types.js";

// ── Phase 2 (add-extension-ui-decorations) ────────────────────────────────

/** Decorator kinds partitioned out of `probe.modules` for Phase-2 forwarding. */
const DECORATOR_KINDS = new Set([
  "footer-segment",
  "agent-metric",
  "breadcrumb",
  "gate",
  "toast",
]);

/** Namespace must be non-empty and match `/^[a-z0-9-]+$/`. */
const NAMESPACE_RE = /^[a-z0-9-]+$/;

/** Default per-session rate cap for `ui:invalidate` re-probes. */
export const INVALIDATE_RATE_CAP_PER_SEC = 20;
/** Minimum interval between probes implied by the rate cap. */
const MIN_PROBE_INTERVAL_MS = Math.ceil(1000 / INVALIDATE_RATE_CAP_PER_SEC); // = 50ms

/**
 * Subset of the bridge's mutable context that this module touches. Mirrors the
 * `BridgeContext` shape but kept structurally typed to avoid the bridge
 * importing extension-internal types.
 */
export interface UiModulesBridgeCtx {
  pi: { events?: { on(event: string, fn: (...args: any[]) => any): void; emit(event: string, ...args: any[]): any } };
  connection: { send(msg: unknown): void };
  /** Read at probe / forward time so the most recent session id is used. */
  getSessionId(): string;
}

/**
 * Server → extension `ui_management` message. Keep the shape loose so this
 * module compiles without depending on the protocol union (which lives in the
 * shared package and would create a cycle for unit tests).
 */
export interface UiManagementInbound {
  type: "ui_management";
  sessionId: string;
  action: string;
  event: string;
  params?: Record<string, unknown>;
}

/**
 * Run the discovery probe for `ctx`. Synchronous — collects whatever
 * extensions push into `probe.modules` during the `pi.events.emit` call and
 * forwards the populated list to the server via `connection.send`.
 *
 * Last-write-wins on duplicate `id` within a single probe; collisions log a
 * single `console.warn` per duplicate id (Decision §2 / spec scenario
 * "Last-write-wins on duplicate id").
 */
export function refreshUiModules(ctx: UiModulesBridgeCtx): void {
  const events = ctx.pi.events;
  if (!events || typeof events.emit !== "function") return;

  // Probe accepts the union of Phase-1 modules + Phase-2 decorators (which may
  // additionally carry a top-level `removed: true` flag from the extension).
  const probe = { modules: [] as Array<ExtensionUiModule | (DecoratorDescriptor & { removed?: boolean })> };
  try {
    events.emit("ui:list-modules", probe);
  } catch (err) {
    console.error("[dashboard][ui-modules] probe emit failed:", err);
    return;
  }

  // Phase-1 partition: management-modal modules → ui_modules_list.
  // Last-write-wins on duplicate id; warn once per collision.
  const byId = new Map<string, ExtensionUiModule>();
  const moduleWarned = new Set<string>();

  // Phase-2 partition: decorators → one ext_ui_decorator per descriptor.
  // Last-write-wins on `(kind, namespace, id)` collision within one probe;
  // one warning per colliding key.
  const decoratorByKey = new Map<string, DecoratorDescriptor & { removed?: boolean }>();
  const decoratorWarned = new Set<string>();

  for (const entry of probe.modules) {
    if (!entry || typeof (entry as any).kind !== "string") continue;

    if ((entry as any).kind === "management-modal") {
      const mod = entry as ExtensionUiModule;
      if (typeof mod.id !== "string" || mod.id.length === 0) continue;
      if (byId.has(mod.id) && !moduleWarned.has(mod.id)) {
        moduleWarned.add(mod.id);
        console.warn(`[dashboard][ui-modules] duplicate module id "${mod.id}" — last-write-wins`);
      }
      byId.set(mod.id, mod);
      continue;
    }

    if (DECORATOR_KINDS.has((entry as any).kind)) {
      const dec = entry as DecoratorDescriptor & { removed?: boolean };
      if (typeof dec.namespace !== "string" || !NAMESPACE_RE.test(dec.namespace)) {
        console.warn(
          `[dashboard][ui-modules] dropping ${dec.kind} descriptor: invalid namespace ${JSON.stringify(dec.namespace)} (must match /^[a-z0-9-]+$/)`,
        );
        continue;
      }
      if (typeof dec.id !== "string" || dec.id.length === 0) {
        console.warn(`[dashboard][ui-modules] dropping ${dec.kind} descriptor: missing/empty id`);
        continue;
      }
      const key = `${dec.kind}:${dec.namespace}:${dec.id}`;
      if (decoratorByKey.has(key) && !decoratorWarned.has(key)) {
        decoratorWarned.add(key);
        console.warn(`[dashboard][ui-modules] duplicate decorator key "${key}" — last-write-wins`);
      }
      decoratorByKey.set(key, dec);
      continue;
    }

    // Unknown kind — ignore silently (forward-compat for future kinds).
  }

  const modules = Array.from(byId.values());
  const sessionId = ctx.getSessionId();
  ctx.connection.send({
    type: "ui_modules_list",
    sessionId,
    modules,
  });

  for (const dec of decoratorByKey.values()) {
    const { removed, ...descriptor } = dec;
    const msg: Record<string, unknown> = {
      type: "ext_ui_decorator",
      sessionId,
      descriptor,
    };
    if (removed === true) msg.removed = true;
    ctx.connection.send(msg);
  }
}

/**
 * Attach the `ui:invalidate` listener for this session. Idempotent — the
 * caller is responsible for invoking exactly once per session lifetime
 * (typically inside the `session_start` handler).
 *
 * The optional `{ id }` payload is logged for telemetry only — Phase 1 always
 * re-probes the full module set.
 */
export function subscribeUiInvalidate(ctx: UiModulesBridgeCtx): void {
  const events = ctx.pi.events;
  if (!events || typeof events.on !== "function") return;

  // Per-session rate cap on `ui:invalidate` re-probes. Throttled to one probe
  // per `MIN_PROBE_INTERVAL_MS` (= 50ms, i.e. 20/sec): leading edge fires
  // immediately; subsequent invalidations within the window coalesce into a
  // single trailing-edge probe. One warning per offending burst, latched
  // until a full quiet window passes.
  let lastProbeAt = -Infinity;
  let trailingScheduled = false;
  let burstWarned = false;

  const fireProbe = () => {
    lastProbeAt = Date.now();
    refreshUiModules(ctx);
  };

  events.on("ui:invalidate", () => {
    const now = Date.now();
    const sinceLast = now - lastProbeAt;
    if (sinceLast >= MIN_PROBE_INTERVAL_MS) {
      // Leading edge — fire immediately. If the previous burst settled
      // (i.e. >= one quiet window has elapsed), reset the warning latch.
      if (sinceLast >= MIN_PROBE_INTERVAL_MS * 2) burstWarned = false;
      fireProbe();
      return;
    }
    if (!burstWarned) {
      burstWarned = true;
      console.warn(
        `[dashboard][ui-modules] ui:invalidate rate cap exceeded ` +
        `(>${INVALIDATE_RATE_CAP_PER_SEC}/sec); coalescing further invalidations to a trailing-edge probe`,
      );
    }
    if (!trailingScheduled) {
      trailingScheduled = true;
      const delay = Math.max(0, MIN_PROBE_INTERVAL_MS - sinceLast);
      setTimeout(() => {
        trailingScheduled = false;
        fireProbe();
      }, delay);
    }
  });
}

/**
 * Handle a server-originated `ui_management` message. Re-emits on
 * `pi.events` with `_reply` injected so listeners can either:
 *
 *   1. Push synchronous row data into `data.items` (used by `action: "list"`).
 *   2. Call `data._reply(items)` to forward asynchronously.
 *
 * Either path produces a `ui_data_list { sessionId, event, items }` message
 * back to the server.
 *
 * Fire-and-forget actions (e.g. `delete-row`) typically don't reply; the
 * extension follows up with `pi.events.emit("ui:invalidate", { id })` to
 * trigger a fresh probe.
 */
export function handleUiManagement(ctx: UiModulesBridgeCtx, msg: UiManagementInbound): void {
  const events = ctx.pi.events;
  if (!events || typeof events.emit !== "function") return;

  let replied = false;
  const reply = (items: unknown[]) => {
    if (replied) return;
    replied = true;
    if (!Array.isArray(items)) return;
    ctx.connection.send({
      type: "ui_data_list",
      sessionId: ctx.getSessionId(),
      event: msg.event,
      items,
    });
  };

  const data: { items?: unknown[]; action: string; _reply: (items: unknown[]) => void } & Record<string, unknown> = {
    ...(msg.params ?? {}),
    action: msg.action,
    _reply: reply,
  };

  try {
    events.emit(msg.event, data);
  } catch (err) {
    console.error(`[dashboard][ui-modules] handler for "${msg.event}" threw:`, err);
    return;
  }

  // Synchronous fast path: extension populated data.items directly.
  if (!replied && Array.isArray(data.items)) {
    reply(data.items);
  }
}
