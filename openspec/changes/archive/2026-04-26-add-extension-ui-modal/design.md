## Context

The umbrella design `extension-ui-system` (design-only, archived) defines a generalized, schema-driven mechanism for extensions to declare UI surfaces that the dashboard renders in a bounded set of named slots, without per-extension React. This change implements **Phase 1** of that system: the `management-modal` slot.

PR #15 (`feat: implement Generalized Extension UI System (Hybrid Schema)` + `feat: enhance generalized UI with description, sections, and categories`, commits `55bbba8` / `d623eb3`) prototyped this slot on a stale baseline (537 files / ~50k deletions vs `develop`) bundled with unrelated ragger work. PR #15 is **not being merged**. This change rebuilds the prototype on current `develop`, keeping PR #15's wire-protocol message names and field names verbatim where they are correct so any later PR-#15 archival diff stays small.

Current state of the dashboard:

- `ctx.ui.*` one-shot prompts already flow through the **PromptBus** (`packages/extension/src/prompt-bus.ts`) → `prompt_request` / `prompt_dismiss` / `prompt_cancel` protocol → `useMessageHandler.ts` interactive-request reducer. PromptBus is request/response with first-response-wins semantics.
- Extension-emitted events fan out via the catch-all `event_forward` path; consumers must know each channel by name and hard-code per-extension React.
- Pi-judo and similar extensions register TUI surfaces (`flow:register-card`, `register-footer-segment`, `ctx.ui.custom`) the dashboard cannot render today.
- The `extension-ui-system` capability spec exists as a stub at `openspec/specs/extension-ui-system/spec.md` (Purpose only, no Requirements). Phase 1 populates its first Requirements block.

Constraints:

- Phase 1 must be additive. PromptBus, `event_forward`, and the existing `interactive-ui-dialogs` / `ui-proxy` / `extension-ui-forwarding` capabilities remain untouched.
- Extensions must remain pi-runnable when no dashboard is connected. Descriptors are inert in pure-pi mode.
- No new runtime SDK package. Extensions register UI by listening on `pi.events`, never by `import`-ing `@blackbelt-technology/pi-dashboard-sdk`.
- Reconnect must be lossless: dashboard reload or server restart must replay the current module set and any cached row data without extension involvement.
- Phase 1 view types are exactly `table | grid | form`. Richer views (`search`, `metrics`, `detail`, `rjsf-form`) are explicitly deferred to follow-up changes.

## Goals / Non-Goals

**Goals**

- Implement the discovery probe: bridge emits `ui:list-modules` on `session_start`, after every reconnect, and on `ui:invalidate`; extensions push schemas into `probe.modules`.
- Define the Phase-1 schema types (`ExtensionUiModule`, `UiView`, `UiField`, `UiAction`, `UiSection`) in `@blackbelt-technology/pi-dashboard-shared` exactly as PR #15 named them, so any later archival diff stays small.
- Add the three Phase-1 protocol messages (`ui_modules_list`, `ui_data_list`, `ui_management`) on the bridge↔server and server↔browser legs.
- Cache `Session.uiModules` and `Session.uiDataMap` server-side; replay both inside `handleSubscribe` after the existing event-replay batches complete (parallel to `replayPendingUiRequests`).
- Render a `GenericExtensionDialog` modal supporting `table | grid | form` views with row actions, action confirmations, and `UiAction.confirm` polish via the existing `DialogPortal`-based `ConfirmDialog`.
- Intercept slash commands matching exact `module.command` strings in `CommandInput.tsx` / `SessionHeader.tsx` and open the corresponding modal.
- Populate `openspec/specs/extension-ui-system/spec.md` with Phase-1 requirements; document in `docs/architecture.md` and `AGENTS.md`.

**Non-Goals**

- Phase 2 live decorations (`footer-segment`, `agent-metric`, `breadcrumb`, `gate`, `toast`). Tracked under `add-extension-ui-decorations`.
- Phase 4 RJSF JSON-Schema forms. Tracked under `add-extension-ui-rjsf-form`.
- Ragger's richer view types (`search`, `metrics`, `detail`). Separate follow-up.
- Auto-mirroring `flow:register-*` channels into descriptors. Migration is explicit; pi-flows adoption is a separate change in pi-flows.
- Loading extension-authored React or JS bundles in the browser. Descriptors stay data-only.
- Replacing PromptBus, `ctx.ui.*`, or the catch-all `event_forward` path. They are orthogonal.

## Decisions

### 1. Discovery probe on three triggers

Bridge emits `pi.events.emit("ui:list-modules", probe)` where `probe` is `{ modules: ExtensionUiModule[] }`. Extensions listen and synchronously push descriptors into `probe.modules`. The bridge then forwards `{ type: "ui_modules_list", sessionId, modules }` to the server.

Triggers (all three required):

- **`session_start`** — first probe after the bridge captures `pi`/`ctx` for the session. Same listener slot as `model-tracker` and `flow-event-wiring`.
- **Reconnect** — re-probe after every successful WebSocket reconnect. The bridge already re-runs the same path that fires on `session_start` for re-registration; we hook into that.
- **`ui:invalidate { id? }`** — extension-emitted invalidation. If `id` is omitted, re-probe everything; if `id` is present, re-probe and last-write-wins on `id`. Probe is always a full re-list, never a delta — this matches PR #15 and keeps the bridge stateless.

**Why pull, not push?** Reconnect handling becomes automatic (the bridge re-probes after every reconnect; extensions don't track bridge state). No SDK package import. Idempotent — extensions can register the same listener twice without state corruption; latest probe wins. Matches `flow:list-flows` / `flow:list-workflows`.

### 2. Schema types — verbatim from PR #15

Add to `packages/shared/src/types.ts`:

```ts
export type UiViewKind = "table" | "grid" | "form";

export type UiFieldKind =
  | "text" | "number" | "boolean" | "select"
  | "code" | "datetime" | "textarea";

export interface UiField {
  key: string;                      // dot-path into row / form-state
  label: string;
  kind: UiFieldKind;
  options?: string[];               // for kind: "select"
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  multiline?: boolean;              // legacy alias for kind: "textarea"
  // Display-only metadata (table column width, code language hint, etc.)
  width?: string | number;
  language?: string;                // for kind: "code"
}

export interface UiAction {
  id: string;
  label: string;
  icon?: string;                    // MDI icon name from `@mdi/js`
  variant?: "primary" | "secondary" | "danger";
  // Server emits `ui_management { action: id, event, params }` to extension.
  event: string;
  params?: Record<string, unknown>;
  // If present, dashboard shows ConfirmDialog with this message before emitting.
  confirm?: string;
}

export interface UiSection {
  id: string;
  title?: string;
  description?: string;
  fields: UiField[];
}

export interface UiView {
  kind: UiViewKind;
  // Common
  fields?: UiField[];               // for table/grid columns; form fields if no `sections`
  sections?: UiSection[];           // for form: grouped fields
  // Data wiring
  dataEvent?: string;               // event name to request rows; required for table/grid
  rowKey?: string;                  // unique-row field for table/grid (default: "id")
  rowActions?: UiAction[];          // per-row actions for table/grid
  emptyState?: string;              // shown when items.length === 0
  // Toolbar
  actions?: UiAction[];             // top-of-modal toolbar actions
}

export interface ExtensionUiModule {
  kind: "management-modal";          // Phase 1: only this kind
  id: string;                        // unique module id within the session
  command: string;                   // exact slash command, e.g. "/judo:status"
  title: string;
  description?: string;
  icon?: string;                     // MDI icon name
  category?: string;                 // free-form group label (sidebar grouping in future)
  view: UiView;
}
```

Add to `DashboardSession` in the same file:

```ts
uiModules?: ExtensionUiModule[];
uiDataMap?: Record<string, unknown[]>;
```

**`namespace` on modules is deferred to Phase 2.** Phase 1 keeps PR #15's `id`-only convention; the bridge logs a warning and last-write-wins on `id` collisions within a single probe. This is the stated trade-off in `extension-ui-system/design.md` Decision §6.

### 3. Wire protocol — three messages, PR-#15 names

In `packages/shared/src/protocol.ts` (extension ↔ server):

```ts
// extension → server
export interface UiModulesListMessage {
  type: "ui_modules_list";
  sessionId: string;
  modules: ExtensionUiModule[];
}

export interface UiDataListMessage {
  type: "ui_data_list";
  sessionId: string;
  event: string;                     // matches some module.view.dataEvent
  items: unknown[];
}

// server → extension
export interface UiManagementMessage {
  type: "ui_management";
  sessionId: string;
  action: string;                    // matches some UiAction.id, or "list" for data fetch
  event: string;                     // matches view.dataEvent or action.event
  params?: Record<string, unknown>;
}
```

In `packages/shared/src/browser-protocol.ts` (server ↔ browser):

```ts
// server → browser
export interface UiModulesListBrowserMessage {
  type: "ui_modules_list";
  sessionId: string;
  modules: ExtensionUiModule[];
}

export interface UiDataListBrowserMessage {
  type: "ui_data_list";
  sessionId: string;
  event: string;
  items: unknown[];
}

// browser → server
export interface UiManagementBrowserMessage {
  type: "ui_management";
  sessionId: string;
  action: string;
  event: string;
  params?: Record<string, unknown>;
}
```

All three new browser-bound messages MUST be members of the `ServerToBrowserMessage` union. Members not listed there are dropped by esbuild in production (per AGENTS.md note on `browser-protocol.ts`). The same rule applies to the new browser-originated message in the `BrowserToServerMessage` union.

### 4. Bridge wiring

New module `packages/extension/src/ui-modules.ts`. It owns:

- `refreshUiModules(ctx)` — synchronously emits `ui:list-modules` with a fresh probe object, sends `ui_modules_list` to server.
- `subscribeUiInvalidate(ctx)` — listens for `ui:invalidate` on `pi.events`; calls `refreshUiModules(ctx)`. The optional `{ id }` parameter is recorded for log telemetry only — Phase 1 always re-probes the whole list.
- `handleUiManagement(ctx, msg)` — receives `ui_management` from server. Re-emits to extensions as `pi.events.emit(msg.event, { ...msg.params, action: msg.action, _reply: (items) => sendUiDataList(...) })`. The extension synchronously fills `data.items` (matches PR #15's pattern; consistent with `ui:list-modules` probe shape), and the bridge forwards as `ui_data_list`.

`bridge.ts` calls `refreshUiModules` in:

- the existing `session_start` handler keyed on `event.reason ∈ {"new","fork","resume"}` (same site that re-captures `pi`/`ctx` post pi-0.69),
- the existing reconnect handler in `connection.ts` (after re-registration completes).

This matches the no-`pi.newSession`/`ctx.fork`/`ctx.switchSession` invariant enforced by `packages/extension/src/__tests__/no-session-replacement-calls.test.ts` — `refreshUiModules` only emits events.

### 5. Server cache and replay

Extend `packages/server/src/event-wiring.ts` to:

- On `ui_modules_list` from extension: `sessionManager.update(sessionId, { uiModules: msg.modules })`, broadcast `ui_modules_list` to subscribers.
- On `ui_data_list`: keep an in-memory `uiDataMap` keyed by `event` on the Session record, broadcast to subscribers. Bound the per-event size to the most recent N (default `N = 1000`) entries to prevent runaway extensions blowing memory; on overflow, last-write-wins for that event key.

Extend `packages/server/src/browser-handlers/subscription-handler.ts`:

```ts
function replayUiState(ws: WebSocket, sessionId: string) {
  const session = sessionManager.get(sessionId);
  if (!session?.uiModules?.length) return;
  sendTo(ws, { type: "ui_modules_list", sessionId, modules: session.uiModules });
  if (!session.uiDataMap) return;
  for (const [event, items] of Object.entries(session.uiDataMap)) {
    sendTo(ws, { type: "ui_data_list", sessionId, event, items });
  }
}
```

Call `replayUiState(ws, sessionId)` immediately after each existing `replayPendingUiRequests(ws, sessionId)` site (four call sites in `subscription-handler.ts`). Order: events → pending UI requests → UI module state. This keeps a single replay surface ordering and guarantees UI modules render after their containing event history.

Browser → server `ui_management` is handled in a new `packages/server/src/browser-handlers/ui-management-handler.ts` (or routed inline if 1-call-site small) that forwards via `piGateway.sendToSession(sessionId, msg)`.

### 6. Slash-command interception

In `packages/client/src/components/CommandInput.tsx`, before submit:

1. Check if the trimmed input exactly matches some `module.command` for `module ∈ session.uiModules` (case-sensitive).
2. If yes, open `GenericExtensionDialog` with that module, clear the input, do not send a prompt.
3. Otherwise, fall through to existing behavior.

In `packages/client/src/components/SessionHeader.tsx`: add a small "Modules" entry point only if `session.uiModules?.length` is truthy. It opens a searchable list (`SearchableSelectDialog`) that triggers the same modal launch path. Phase 1 keeps this minimal; richer placement (sidebar grouping by `category`) is left to Phase 2.

Both placements call the same `openExtensionModule(sessionId, moduleId)` helper.

### 7. Client component layout

`packages/client/src/components/extension-ui/GenericExtensionDialog.tsx` (new) renders:

- `view.kind === "table"` → grid of rows with header row from `view.fields`; per-row buttons from `view.rowActions`. On open, dispatches `ui_management { action: "list", event: view.dataEvent }` and shows the result from `session.uiDataMap[view.dataEvent]`.
- `view.kind === "grid"` → identical to `table` but rendered as cards instead of rows; same data lifecycle.
- `view.kind === "form"` → renders `view.fields` (or grouped `view.sections`); submit dispatches each top-level `view.actions` entry. No row data.

Action click flow:

1. If `action.confirm` is set, mount `<ConfirmDialog message={action.confirm} confirmLabel={action.label} onConfirm={…} />`.
2. On confirm, send `ui_management { action: action.id, event: action.event, params: action.params }`.
3. On `ui_data_list` arrival, refresh table/grid view from `session.uiDataMap[view.dataEvent]`.

The component is mounted by `App.tsx` at most once per session, conditional on an open-module flag in local state — same pattern as the existing `FlowLaunchDialog`.

### 8. MDI icon vocabulary

Icons in `UiAction.icon` and `ExtensionUiModule.icon` MUST be MDI keys (e.g. `"mdiCheckCircle"`). Client looks them up in `@mdi/js` via a small allowlisted lookup table; unknown icon names render no icon (no error). This caps the surface, eliminates XSS risk, and matches PR #15.

### 9. Confirmation polish

PR #15 used `window.confirm()` for action confirmation. Phase 1 uses the existing Tailwind `ConfirmDialog` (`packages/client/src/components/ConfirmDialog.tsx`) wrapped in `DialogPortal`. ~20 LOC delta; consistent with the rest of the dashboard. This is decision §3 of `extension-ui-system/design.md`'s open-questions section.

### 10. Testing strategy

- **Bridge** (`packages/extension/src/__tests__/ui-modules.test.ts`):
  - `refreshUiModules` emits `ui:list-modules` and forwards a `ui_modules_list` per registered listener push.
  - `ui:invalidate` triggers a re-probe.
  - `handleUiManagement` re-emits to `pi.events` and forwards the synchronous `data.items` as `ui_data_list`.
- **Server** (`packages/server/src/__tests__/ui-modules-replay.test.ts`):
  - `ui_modules_list` from extension caches on `Session.uiModules` and broadcasts to subscribers.
  - `ui_data_list` caches under `Session.uiDataMap[event]` (with the per-event size cap) and broadcasts.
  - `handleSubscribe` replay sends `ui_modules_list` once and one `ui_data_list` per event in `uiDataMap`.
  - `ui_management` from a subscribed browser is forwarded to the matching session via `piGateway.sendToSession`.
- **Client** (`packages/client/src/__tests__/extension-ui-modal.test.tsx`):
  - Slash-command match on `module.command` opens `GenericExtensionDialog` and suppresses the prompt send.
  - `table` view dispatches `ui_management { action: "list" }` on open and renders `uiDataMap[event]` rows.
  - `UiAction.confirm` mounts `ConfirmDialog` before dispatching; cancel does not dispatch; confirm dispatches.
- **Reconnect parity** — manual smoke check (also captured as a unit test on the server reducer): kill server, reload browser; modules list and last `ui_data_list` per event are re-rendered without bridge participation.

### 11. Documentation

- Replace TBD section of `openspec/specs/extension-ui-system/spec.md` with Phase-1 Requirements (probe trigger semantics, the three protocol messages, server-cache + replay, slash-command interception, three view kinds, MDI-icons, no-dashboard fallback). Mark Phase 2/4 explicitly TBD.
- Promote the "(planned)" Extension UI System paragraph in `docs/architecture.md` to "(Phase 1 shipped)" with a sequence diagram and a Phase-1 surface checklist. Phase-2 paragraph stays planned.
- Add Key Files to `AGENTS.md`: `packages/extension/src/ui-modules.ts`, `packages/server/src/browser-handlers/ui-management-handler.ts` (if extracted), `packages/client/src/components/extension-ui/GenericExtensionDialog.tsx`, plus the new `replayUiState` helper site.

## Risks / Trade-offs

- **Risk:** A poorly-written extension emits `ui_data_list` continuously and OOMs the server. → Mitigation: per-event item cap (default 1000) on `Session.uiDataMap[event]`; bridge already throttles `pi.events` indirectly. Document the cap in the spec.
- **Risk:** Two extensions push modules with the same `id`; only the last one survives. → Mitigation: bridge logs a warning per collision; Phase-2 introduces `namespace`. Acceptable for Phase 1 with the stated migration path.
- **Risk:** Slash command collides with a built-in (e.g. `/model`, `/compact`). → Mitigation: explicit allowlist enforced client-side; modules whose `command` matches a built-in are dropped with a console warning.
- **Risk:** Reconnect duplicates events because both `event_replay` and `ui_modules_list` carry overlapping context. → Mitigation: replay ordering is fixed (events → pending UI requests → UI module state). The UI module state is keyed differently (Session record fields, not the event seq stream); no overlap by construction.
- **Trade-off:** No `namespace` field in Phase 1. We accept the small risk of collisions to keep the wire shape identical to PR #15, so the diff stays small if PR #15 is ever revisited. Phase 2 fixes this with `namespace` and an explicit collision warning.
- **Trade-off:** Phase 1 supports only three view kinds (`table | grid | form`). Ragger and similar extensions will need follow-ups for `search`, `metrics`, `detail`. We deliberately ship the smallest surface that covers PR #15's prototype + ragger's workspace-CRUD baseline.
- **Trade-off:** Phase 1 form view uses bespoke `UiField` types, not JSON Schema. RJSF lands in Phase 4. Today's fields are sufficient for management UIs; the cost of adding JSON Schema now (≥150 KB bundle, validator selection, theme work) is not justified by Phase-1 use cases.

## Migration Plan

This change is purely additive. There is no data migration. Rollout is:

1. Land schema types and protocol additions in `@blackbelt-technology/pi-dashboard-shared`. Bump the package patch version per the existing lockstep release flow (see `release-cut` skill).
2. Land the bridge probe and `ui_management` handler in `packages/extension`. `npm run reload:check && npm run reload` activates them in connected pi sessions.
3. Land the server cache + replay in `packages/server`. `pi-dashboard restart` (or `POST /api/restart`).
4. Land the client component, slash-command interception, and `replayUiState` wire-up in `packages/client`. `npm run build` + restart.
5. Update `docs/architecture.md`, `AGENTS.md`, and `openspec/specs/extension-ui-system/spec.md` as part of the same change.

Rollback: revert in reverse order. Because the change is additive and gated entirely on extensions emitting `ui:list-modules` listeners (no extension does so today), the runtime risk of an in-place revert is negligible — there is no production extension consumer until pi-judo's separate adoption change ships.

## Open Questions

None. All Phase-1-relevant questions were resolved in `extension-ui-system/design.md` §"Resolved Open Questions" (footer placement is Phase 2; toast dedup is Phase 2; confirm polish, icon vocab, and Phase-1 view-kind set apply directly to this change and are reflected in Decisions §7–§9 above).
