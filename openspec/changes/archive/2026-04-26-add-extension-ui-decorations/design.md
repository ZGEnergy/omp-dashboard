## Context

This change implements **Phase 2** of the Generalized Extension UI System (umbrella design `extension-ui-system`, Phase 1 in `add-extension-ui-modal`). Phase 1 ships the `management-modal` slot — a slash-command-triggered modal hosting `table | grid | form` views, plus the `ui:list-modules` probe, server-side caching on `Session.uiModules` / `Session.uiDataMap`, and the replay-on-subscribe wiring in `subscription-handler.ts`.

Phase 2 reuses the same probe primitive (`ui:list-modules`) but adds five *live in-page decoration* slots that the modal cannot host:

| Kind | Placement | Lifetime | Has render closure? |
|---|---|---|---|
| `footer-segment` | `SessionHeader`, right of git info | Persistent | Yes — `render() → string` |
| `agent-metric` | Below `FlowAgentCard` | Per-agent | Yes — `render() → string` |
| `breadcrumb` | Top of `FlowDashboard` | Persistent | No (snapshot, re-emit on change) |
| `gate` | Inline in `FlowLaunchDialog` items | Persistent | No (snapshot) |
| `toast` | Top-right toast tray | One-shot | No |

Today these live decorations are unrepresentable in the dashboard. pi-judo registers `flow:register-card`, `flow:register-footer-segment`, and equivalent TUI surfaces; pi-flows registers `flow:register-workflow` and `flow:register-gate`. None of those surfaces have a dashboard equivalent. Phase 2 closes that gap with one wire shape (`ext_ui_decorator`), one server cache field (`Session.uiDecorators`), one replay extension, and five small client slot components.

Phase 1 must ship before this change. Phase 1 establishes the `ui:list-modules` probe trigger sites (`session_start` + reconnect + `ui:invalidate`), the `replayUiState(ws, sessionId)` helper, and the `Session.uiModules` / `uiDataMap` storage idiom — Phase 2 piggybacks on all three.

## Goals / Non-Goals

**Goals**

- Add a single discriminated-union protocol message `ext_ui_decorator` (extension → server → browser) carrying all five live decoration kinds plus an explicit `removed: true` removal signal.
- Add `Session.uiDecorators?: Record<string, DecoratorDescriptor>` keyed by `${kind}:${namespace}:${id}` (server-side cache).
- Extend the bridge's `refreshUiModules()` (Phase 1) to partition probe results: `kind: "management-modal"` keeps flowing through `ui_modules_list`; the five Phase-2 kinds are forwarded as one `ext_ui_decorator` per descriptor.
- Add `namespace: string` to descriptor shapes (Phase 2 only, Phase 1 modules continue with `id`-only). Bridge logs a warning + last-write-wins on `(namespace, id)` collision within a single probe.
- Add five client slot components in `packages/client/src/components/extension-ui/` and mount them in their host components (`SessionHeader`, `FlowAgentCard`, `FlowDashboard`, `FlowLaunchDialog`, `App`).
- Extend `replayUiState(ws, sessionId)` (added by Phase 1) to also replay `Session.uiDecorators` after `uiModules` and `uiDataMap`.
- Populate the `extension-ui-system` capability spec with Phase-2 Requirements covering all five kinds, the wire format, and namespace collision behavior.

**Non-Goals**

- Phase 1 (`management-modal`). Tracked in `add-extension-ui-modal`.
- Phase 4 RJSF JSON-Schema forms. Tracked in `add-extension-ui-rjsf-form`.
- pi-flows / pi-judo adoption. Those are Phase 3 in the respective extension repos and ship independently.
- Auto-mirroring `flow:register-*` channels into descriptors. Migration in extensions remains explicit.
- Loading extension-authored React or JS bundles in the browser. Descriptors stay data-only.
- Replacing PromptBus, `event_forward`, or any existing capability.
- New discovery primitive. Phase 2 reuses Phase 1's `ui:list-modules` probe verbatim.

## Decisions

### 1. Single-union `ext_ui_decorator` (vs five per-kind messages)

Phase 2 ships ≥5 kinds in one batch. Adding five new message types — `footer_segment_set`, `agent_metric_set`, etc. — would five-fold the protocol surface for no functional benefit (each has one client handler and one server forwarder). One discriminated union gives:

- A single switch case in `useMessageHandler.ts` and `event-wiring.ts`.
- A single union member to remember to add to `ServerToBrowserMessage` / `ExtensionToServerMessage` (the production-build invariant called out in AGENTS.md for `browser-protocol.ts` and `protocol.ts`).
- Symmetric add/remove semantics — `removed: true` in the same message shape.
- Easy to extend: a new Phase-2-style kind in the future is one new payload type and one new `case` in the switch, not a new message type.

Phase 1's three messages are kept as-is (different `type` values; no ambiguity), matching Decision §4 of the umbrella design and avoiding rewriting the prototype.

```ts
// packages/shared/src/types.ts (additions)
export type DecoratorKind =
  | "footer-segment"
  | "agent-metric"
  | "breadcrumb"
  | "gate"
  | "toast";

export interface FooterSegmentPayload  { text: string; tooltip?: string; icon?: string }
export interface AgentMetricPayload    { agentId: string; text: string; tooltip?: string }
export interface BreadcrumbStep        { id: string; label: string; status: "pending" | "active" | "done" | "error" }
export interface BreadcrumbPayload     { steps: BreadcrumbStep[]; current?: string }
export interface GatePayload           { flowId: string; available: boolean; reason?: string }
export interface ToastPayload          {
  level: "info" | "success" | "warn" | "error";
  message: string;
  durationMs?: number;            // default 5000; 0 = sticky until dismissed
}

export type DecoratorDescriptor =
  | { kind: "footer-segment"; namespace: string; id: string; payload: FooterSegmentPayload }
  | { kind: "agent-metric";   namespace: string; id: string; payload: AgentMetricPayload }
  | { kind: "breadcrumb";     namespace: string; id: string; payload: BreadcrumbPayload }
  | { kind: "gate";           namespace: string; id: string; payload: GatePayload }
  | { kind: "toast";          namespace: string; id: string; payload: ToastPayload };

// Session record additions
uiDecorators?: Record<string, DecoratorDescriptor>;  // key = `${kind}:${namespace}:${id}`
```

```ts
// packages/shared/src/protocol.ts and browser-protocol.ts
export interface ExtUiDecoratorMessage {
  type: "ext_ui_decorator";
  sessionId: string;
  descriptor: DecoratorDescriptor;
  removed?: boolean;       // when true, server deletes cache entry by composite key
}
```

`ExtUiDecoratorMessage` MUST be a member of both `ExtensionToServerMessage` (in `protocol.ts`) and `ServerToBrowserMessage` (in `browser-protocol.ts`) unions. Members not listed there are stripped by esbuild in production — same invariant Phase 1 already enforced for its three message types.

### 2. Probe partitioning at the bridge

Phase 1 introduced `refreshUiModules(ctx)` in `packages/extension/src/ui-modules.ts`. Phase 2 extends — does not duplicate — this function:

```ts
export async function refreshUiModules(ctx: BridgeContext): Promise<void> {
  const probe: { modules: (ExtensionUiModule | DecoratorDescriptor)[] } = { modules: [] };
  ctx.pi.events.emit("ui:list-modules", probe);

  const modules:    ExtensionUiModule[]     = [];
  const decorators: DecoratorDescriptor[]   = [];
  for (const m of probe.modules) {
    if (m.kind === "management-modal") modules.push(m as ExtensionUiModule);
    else                                decorators.push(m as DecoratorDescriptor);
  }

  ctx.send({ type: "ui_modules_list", sessionId: ctx.sessionId, modules });
  for (const d of decorators) {
    ctx.send({ type: "ext_ui_decorator", sessionId: ctx.sessionId, descriptor: d });
  }
}
```

Trigger sites are unchanged from Phase 1 (`session_start` + `connection.ts` reconnect callback + `ui:invalidate` listener). Extensions push to the same probe array regardless of kind — a single listener per extension can register both a modal and decorators.

The decorator partition is purely a forwarding concern; both arrays are derived from the same probe object. There is no separate "decorator probe" channel.

### 3. Decorator removal semantics — explicit `removed: true`

Resolves Open Question §5 of the umbrella design (Resolved: explicit). Diffing previous-vs-current probe results at the bridge is rejected as too magical and non-discoverable. Extensions push a normal descriptor with `removed: true`:

```ts
pi.events.on("ui:list-modules", (data) => {
  if (gateActive) {
    data.modules.push({ kind: "gate", namespace: "judo", id: "save-discard", payload: { flowId: "judo:save", available: false, reason: "..." }});
  } else {
    data.modules.push({ kind: "gate", namespace: "judo", id: "save-discard", payload: { flowId: "judo:save", available: true }, removed: true } as DecoratorDescriptor & { removed: true });
  }
});
```

The bridge forwards `ext_ui_decorator { descriptor, removed: true }`. The server deletes `Session.uiDecorators[`${kind}:${namespace}:${id}`]` and broadcasts the same removal message to subscribers. Browser slot components see `removed: true` and unmount that descriptor.

This is one wire shape, one cache key, one explicit signal. Removing-by-omission would require the server to diff successive `ui_modules_list` payloads against decorator state, which complicates Phase 1's idempotent forwarding.

### 4. Namespacing and collision

Decorator descriptors carry both `namespace: string` and `id: string`. Cache key is `${kind}:${namespace}:${id}`. Within a single probe pass:

- Two pushes with the same `(kind, namespace, id)` triple → bridge logs a warning, last-write-wins, server stores only the latest.
- Different namespaces with the same `id` → no collision; both stored.
- Cross-extension collision on `id` alone (no namespace) is impossible because `namespace` is required.

`namespace` MUST be a non-empty string of `[a-z0-9-]+`. The bridge validates and drops malformed namespaces with a warning. Convention: extensions use their package short-name (`"judo"`, `"flows"`).

Phase 1 modules keep `id`-only collision semantics (per `add-extension-ui-modal/design.md` Decision §2's stated trade-off). This change does *not* retrofit `namespace` onto Phase 1 — that is reserved for a future spec evolution if needed.

### 5. Server cache and replay

`packages/server/src/event-wiring.ts` gains one new switch arm:

```ts
case "ext_ui_decorator": {
  const key = `${msg.descriptor.kind}:${msg.descriptor.namespace}:${msg.descriptor.id}`;
  const session = sessionManager.get(msg.sessionId);
  if (!session) break;
  const decorators = { ...(session.uiDecorators ?? {}) };
  if (msg.removed) delete decorators[key];
  else             decorators[key] = msg.descriptor;
  sessionManager.update(msg.sessionId, { uiDecorators: decorators });
  broadcastToSubscribers(msg.sessionId, msg);   // forward verbatim, including removed flag
  break;
}
```

`replayUiState(ws, sessionId)` in `subscription-handler.ts` (added by Phase 1) is extended to send one `ext_ui_decorator` per entry in `session.uiDecorators` after the existing `ui_modules_list` + `ui_data_list` replay. The replay never sets `removed: true` — only live entries are replayed; deleted entries are already absent from the cache.

Replay ordering becomes: events → pending UI requests → UI modules list → UI data list (per `event`) → UI decorators (per cache key). The extension is not involved on browser-only reconnect.

### 6. Client slot components

Five new files under `packages/client/src/components/extension-ui/`:

| File | Mount site | Filter |
|---|---|---|
| `FooterSegmentSlot.tsx` | `SessionHeader.tsx`, right of git info | `kind === "footer-segment"` |
| `AgentMetricSlot.tsx` | Inside `FlowAgentCard.tsx` (one per card) | `kind === "agent-metric" && payload.agentId === card.agentId` |
| `BreadcrumbSlot.tsx` | Top of `FlowDashboard.tsx` | `kind === "breadcrumb"` (most recent wins if multiple) |
| `GateSlot.tsx` | Inline in each `FlowLaunchDialog` item | `kind === "gate" && payload.flowId === item.flowId` |
| `ToastSlot.tsx` | `App.tsx` (top-right tray, fixed-position) | `kind === "toast"` |

Each component reads `session.uiDecorators` and renders only matching descriptors. State updates flow through `useMessageHandler.ts`, which dispatches `ext_ui_decorator` (with or without `removed`) into the same per-session reducer slot that already owns `uiModules` / `uiDataMap`.

`ToastSlot` deduplication: **none**. Resolves Open Question §2 of the umbrella design (Resolved: stack each toast). Toasts auto-dismiss after `payload.durationMs` (default 5000ms; `0` = sticky). Throttling is the extension's responsibility.

`GateSlot` rendering: greys out the `FlowLaunchDialog` item with a warning icon and renders `payload.reason` as a tooltip on hover. `available: true` removes any prior gate styling for that `flowId`.

`BreadcrumbSlot` rendering: a horizontal step indicator (one chip per `BreadcrumbStep`); active step highlighted, done steps shown with check, error steps shown red. Layout matches the existing `FlowDashboard` typography.

All five components are MDI-icon-only (consistent with Phase 1 Decision §8). `FooterSegmentPayload.icon` and any other icon fields are looked up via `mdi-icon-lookup.ts` (added in Phase 1); unknown keys render no icon.

### 7. Closure timing — invalidate-only

Decorators with closures (`footer-segment`, `agent-metric`) follow the umbrella design Decision §2: extensions emit `ui:invalidate` when state changes; the bridge re-probes; the new descriptor's `payload.text` reflects the fresh state. The bridge does **not** poll. Forgetting to invalidate renders stale text — same contract as `pi-tui`'s `onRegistered(invalidate)`.

The `render()` closure described in the umbrella design is conceptually evaluated *inside the extension* during the probe — in practice, extensions push `payload.text: render()` directly into the descriptor before the probe returns. The bridge sees only literal string payloads. This keeps the protocol JSON-only and avoids the need to call closures across the bridge boundary.

### 8. No-dashboard fallback

Inherited from Phase 1 / umbrella design Decision §7. When no bridge is connected: `ui:list-modules` is never emitted; extension listeners are dormant; `ui:invalidate` is a no-op; existing TUI registrations are unaffected. Phase 2 adds nothing to this fallback contract.

### 9. Testing strategy

- **Bridge** (`packages/extension/src/__tests__/ui-decorators.test.ts`):
  - Probe with mixed module + decorator listener pushes results in one `ui_modules_list` (modal kinds only) plus N `ext_ui_decorator` messages (one per decorator kind).
  - `ui:invalidate` re-emits the same partition.
  - `removed: true` is forwarded verbatim.
  - Malformed `namespace` (empty / non-matching regex) is dropped with a warning; payload is not forwarded.
  - `(namespace, id)` collision within one probe logs a warning and forwards only the last descriptor.
- **Server** (`packages/server/src/__tests__/ui-decorators-replay.test.ts`):
  - `ext_ui_decorator` from extension caches under `Session.uiDecorators[key]` and broadcasts to subscribers.
  - `ext_ui_decorator { removed: true }` deletes the cache entry and broadcasts removal.
  - `replayUiState()` after the Phase-1 replay sends one `ext_ui_decorator` per cache entry, never with `removed: true`.
  - Replay ordering: modules → data → decorators.
- **Client** (`packages/client/src/__tests__/extension-ui-decorators.test.tsx`):
  - `FooterSegmentSlot` renders matching descriptors; non-matching kinds are filtered out.
  - `GateSlot` greys out the matching `FlowLaunchDialog` item; `reason` shows as tooltip.
  - `ToastSlot` stacks multiple concurrent toasts and auto-dismisses after `durationMs`.
  - `removed: true` unmounts the matching descriptor without affecting siblings.
  - `BreadcrumbSlot` renders steps in declared order.
- **Reconnect parity** — server reducer test: kill the server, reload the browser; decorators are re-rendered via `replayUiState` without bridge involvement.

### 10. Documentation

- Extend `openspec/specs/extension-ui-system/spec.md` with Phase-2 Requirements: probe partitioning, the `ext_ui_decorator` wire format, the five slot kinds and their payloads, namespace collision behavior, decorator removal semantics, replay ordering.
- Promote the "(planned)" Phase-2 paragraph in `docs/architecture.md` to "(Phase 2 shipped)" with the slot table and a sequence diagram covering invalidate → probe → ext_ui_decorator → slot re-render.
- Add Key Files entries to `AGENTS.md`:
  - `packages/client/src/components/extension-ui/FooterSegmentSlot.tsx`
  - `packages/client/src/components/extension-ui/AgentMetricSlot.tsx`
  - `packages/client/src/components/extension-ui/BreadcrumbSlot.tsx`
  - `packages/client/src/components/extension-ui/GateSlot.tsx`
  - `packages/client/src/components/extension-ui/ToastSlot.tsx`
  - Extension to `Session.uiDecorators` invariant in the `event-wiring.ts` and `subscription-handler.ts` rows (mirror the Phase-1 callouts).

## Risks / Trade-offs

- **Risk:** A misbehaving extension fires `ui:invalidate` in a tight loop, generating sustained `ext_ui_decorator` traffic. → Mitigation: same throttling philosophy as Phase 1's `ui_data_list` cap. Add a per-session decorator-invalidation rate guard (default: ≤20 invalidations/sec; excess logged + dropped) in the bridge. Document the cap.
- **Risk:** Two extensions push `gate` descriptors for the same `flowId` from different namespaces. Both render. → Mitigation: `GateSlot` shows the most-restrictive gate (any `available: false` wins); reasons are concatenated. Documented in the spec.
- **Risk:** `BreadcrumbSlot` collision when two extensions both push a breadcrumb. → Mitigation: most recent (highest `${namespace}:${id}` cache-write order) wins; warning logged. Two extensions defining a breadcrumb for the same dashboard tab is an explicit error mode.
- **Risk:** Toast spam from a poorly-written extension. → Mitigation: `ToastSlot` caps the simultaneous-toast count at 5 (FIFO eviction, oldest dismissed first). The cap is a client-side concern only; the server cache stores all toasts, but the slot only renders the most recent 5. Documented in the spec.
- **Risk:** `ext_ui_decorator` is missed from `ServerToBrowserMessage` / `ExtensionToServerMessage` unions and silently stripped in production builds. → Mitigation: same convention as Phase 1; an `OpenSpec` task explicitly calls out the union update; a unit test in `packages/shared/src/__tests__/protocol-unions.test.ts` (extended) asserts the new type is a member of both unions at compile time via a type-level lookup.
- **Trade-off:** No `namespace` on Phase 1 modules. Cross-phase parity would require a Phase-1 migration we are deliberately deferring. Accepted, with the migration path already documented in Phase 1.
- **Trade-off:** No client-side authoring of decorator descriptors (e.g. "browser asks the bridge to register a gate"). Decorators flow extension → browser only. Browser-originated registrations would require a different probe shape and aren't motivated by any current consumer.
- **Trade-off:** `agent-metric` ties payload to `agentId` by string. If the flow refactors and an `agentId` changes, a previously-cached metric becomes orphaned (renders nothing, but lingers in the cache). Acceptable: session deletion cleans up; explicit `removed: true` allows extensions to clear stale metrics.

## Migration Plan

This change is purely additive on top of Phase 1. Rollout:

1. Land schema additions (`DecoratorDescriptor`, `Session.uiDecorators`, `ExtUiDecoratorMessage`) in `@blackbelt-technology/pi-dashboard-shared`. Patch-version bump per the existing lockstep release flow.
2. Extend bridge `refreshUiModules()` in `packages/extension/src/ui-modules.ts` to partition the probe and forward decorators. `npm run reload:check && npm run reload`.
3. Extend `event-wiring.ts` and `replayUiState` in `packages/server/src/`. `pi-dashboard restart`.
4. Add the five slot components in `packages/client/src/components/extension-ui/`, mount them in `SessionHeader`, `FlowDashboard`, `FlowAgentCard`, `FlowLaunchDialog`, `App`. Extend `useMessageHandler.ts` reducer. `npm run build` + restart.
5. Update `openspec/specs/extension-ui-system/spec.md` Phase-2 Requirements; update `docs/architecture.md` and `AGENTS.md`.

Rollback: revert in reverse order. Because no extension pushes Phase-2 descriptors today (pi-judo / pi-flows adoption is Phase 3, separate repos), the runtime risk of an in-place revert is negligible — the cache stays empty, slot components render nothing, `replayUiState` short-circuits.

## Open Questions

None. All Phase-2-relevant questions are resolved in `extension-ui-system/design.md` §"Resolved Open Questions" (footer placement §1, toast dedup §2, decorator dispose semantics §5, pi-flows breadcrumb-first adoption §6). Cross-phase decisions (icon vocabulary, no-SDK-package, pull-discovery probe) are inherited verbatim from Phase 1.
