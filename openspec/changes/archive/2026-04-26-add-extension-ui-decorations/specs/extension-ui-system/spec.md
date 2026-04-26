## ADDED Requirements

### Requirement: Bridge SHALL partition probe results into modules and decorators

The bridge's `refreshUiModules(ctx)` (added by Phase 1) MUST partition entries pushed into `probe.modules` by `kind`. Entries with `kind === "management-modal"` MUST be forwarded as a single `ui_modules_list` message (Phase 1 behavior, unchanged). Entries with `kind ∈ {"footer-segment", "agent-metric", "breadcrumb", "gate", "toast"}` MUST each be forwarded as one `ext_ui_decorator` message with the descriptor verbatim.

The probe trigger sites are unchanged from Phase 1: `session_start` (with `event.reason ∈ {"new","fork","resume"}`), successful WebSocket reconnect after re-registration, and any extension-emitted `ui:invalidate` event. Phase 2 introduces no new probe channels.

#### Scenario: Mixed probe partitions correctly
- **WHEN** a probe receives one `management-modal` descriptor and three decorator descriptors of different kinds
- **THEN** the bridge forwards exactly one `ui_modules_list` message containing only the `management-modal` descriptor
- **AND** the bridge forwards exactly three `ext_ui_decorator` messages, one per decorator descriptor

#### Scenario: Decorator-only probe forwards no modules list
- **WHEN** the only descriptors pushed during a probe are decorators (no `management-modal`)
- **THEN** the bridge forwards `ui_modules_list { modules: [] }` (or skips the message — implementation choice, but MUST NOT crash)
- **AND** the bridge forwards one `ext_ui_decorator` per decorator descriptor

#### Scenario: Invalidate triggers decorator re-forwarding
- **WHEN** an extension emits `pi.events.emit("ui:invalidate", { id: "model-state" })` after pushing a `footer-segment` decorator on a previous probe with fresh payload text
- **THEN** the bridge re-runs the probe and forwards an updated `ext_ui_decorator` whose `payload.text` reflects the new state

### Requirement: Decorator descriptors SHALL carry namespace and validated id

Decorator descriptors MUST include both `namespace: string` and `id: string` fields. `namespace` MUST be a non-empty string matching `/^[a-z0-9-]+$/`. The bridge MUST drop and warn on descriptors with malformed or empty `namespace`. The cache key for server-side storage and replay MUST be the literal string `${kind}:${namespace}:${id}`.

Within a single probe pass, two pushes producing the same `(kind, namespace, id)` triple MUST cause the bridge to log a warning naming the colliding key and forward only the last-pushed descriptor. Two pushes with the same `id` but different `namespace` are NOT a collision and both MUST be forwarded.

Phase 2 does NOT retroactively introduce a `namespace` field onto Phase 1 `management-modal` modules; modules retain the `id`-only convention from Phase 1.

#### Scenario: Two namespaces, same id, both forwarded
- **WHEN** extensions `pi-judo` and `pi-flows` both push a decorator with `id: "model-state"` but different `namespace` values (`"judo"` vs `"flows"`)
- **THEN** the bridge forwards two separate `ext_ui_decorator` messages
- **AND** the server caches them under distinct keys

#### Scenario: Same triple within one probe collides
- **WHEN** a single probe pushes two `footer-segment` descriptors with the same `(namespace, id)`
- **THEN** the bridge logs a collision warning naming the cache key
- **AND** the bridge forwards only the last-pushed descriptor

#### Scenario: Empty namespace is rejected
- **WHEN** a probe pushes a decorator with `namespace: ""`
- **THEN** the bridge logs a validation warning and does NOT forward an `ext_ui_decorator` for that descriptor

### Requirement: Wire protocol SHALL include the ext_ui_decorator message

The shared package MUST export `ExtUiDecoratorMessage` carrying `{ type: "ext_ui_decorator", sessionId, descriptor: DecoratorDescriptor, removed?: boolean }`. The same message shape MUST appear on the extension↔server (`protocol.ts`) and server↔browser (`browser-protocol.ts`) legs. `ExtUiDecoratorMessage` MUST be a member of both the `ExtensionToServerMessage` union and the `ServerToBrowserMessage` union; otherwise esbuild strips the switch arms in production builds.

`DecoratorDescriptor` MUST be a discriminated union over `kind ∈ {"footer-segment", "agent-metric", "breadcrumb", "gate", "toast"}` with the per-kind `payload` shapes defined below:

- `footer-segment` — `{ text: string; tooltip?: string; icon?: string }`
- `agent-metric` — `{ agentId: string; text: string; tooltip?: string }`
- `breadcrumb` — `{ steps: { id: string; label: string; status: "pending" | "active" | "done" | "error" }[]; current?: string }`
- `gate` — `{ flowId: string; available: boolean; reason?: string }`
- `toast` — `{ level: "info" | "success" | "warn" | "error"; message: string; durationMs?: number }`

Icon fields (`footer-segment.icon` and any future decorator icons) MUST refer to keys exported by `@mdi/js`; unknown keys MUST render no icon and emit no user-facing error.

#### Scenario: Decorator message propagates extension → browser
- **WHEN** the bridge sends `ext_ui_decorator { sessionId: "s1", descriptor: { kind: "footer-segment", namespace: "judo", id: "model-state", payload: { text: "3 mut" } } }`
- **THEN** the server caches the descriptor under key `"footer-segment:judo:model-state"` on `Session.uiDecorators`
- **AND** the server broadcasts an identical `ext_ui_decorator` to every browser subscribed to `s1`

#### Scenario: Removed flag is forwarded verbatim
- **WHEN** the bridge sends `ext_ui_decorator { ..., removed: true }`
- **THEN** the server deletes the cache entry under the matching key
- **AND** the server broadcasts the message to subscribers with `removed: true` preserved

### Requirement: Server SHALL cache decorators and replay on subscribe

The server MUST extend the in-memory Session record with `uiDecorators?: Record<string, DecoratorDescriptor>` keyed by `${kind}:${namespace}:${id}`. On `ext_ui_decorator` from an extension:

- If `removed === true`, the server MUST delete the matching cache entry and broadcast the message verbatim. Deleting an absent key MUST be a no-op (no error, no broadcast suppression).
- Otherwise the server MUST upsert the descriptor under its cache key and broadcast.

`replayUiState(ws, sessionId)` (Phase 1 helper) MUST be extended to send one `ext_ui_decorator` message per entry in `session.uiDecorators` after the existing `ui_modules_list` and `ui_data_list` replay batches. Replay messages MUST NOT carry `removed: true` — only live entries are replayed; removed entries are already absent from the cache.

The replay ordering MUST be: events → pending UI requests → `ui_modules_list` → `ui_data_list` (per event) → `ext_ui_decorator` (per cache key).

When the Session record is removed, the cached `uiDecorators` MUST be removed with it; no separate cleanup is required.

#### Scenario: Decorators replay on subscribe after Phase-1 batches
- **WHEN** a browser subscribes to a session whose `uiDecorators` contains three live entries
- **THEN** the server sends one `ui_modules_list` (Phase 1), the corresponding `ui_data_list` messages (Phase 1), and then exactly three `ext_ui_decorator` messages (one per cache entry) — none with `removed: true`

#### Scenario: Removed decorator deletes cache entry
- **WHEN** the server receives `ext_ui_decorator { descriptor: {kind:"gate", namespace:"judo", id:"save"}, removed: true }` and the matching cache entry exists
- **THEN** the server deletes `session.uiDecorators["gate:judo:save"]`
- **AND** the server broadcasts the removal message to subscribers

#### Scenario: Removal of absent entry is a no-op
- **WHEN** the server receives `ext_ui_decorator { ..., removed: true }` for a key that is not in the cache
- **THEN** the server takes no cache action and still broadcasts the message verbatim to subscribers

### Requirement: Client SHALL render decorators in five named slots

The client MUST mount five slot components, each filtering `session.uiDecorators` by `kind` and rendering only matching descriptors:

| Slot component | Mount site | Filter |
|---|---|---|
| `FooterSegmentSlot` | `SessionHeader.tsx`, right of git info | `kind === "footer-segment"` |
| `AgentMetricSlot` | Inside `FlowAgentCard.tsx`, one per card | `kind === "agent-metric" && payload.agentId === card.agentId` |
| `BreadcrumbSlot` | Top of `FlowDashboard.tsx` | `kind === "breadcrumb"` |
| `GateSlot` | Inline in each `FlowLaunchDialog` item | `kind === "gate" && payload.flowId === item.flowId` |
| `ToastSlot` | `App.tsx`, fixed top-right tray | `kind === "toast"` |

`useMessageHandler.ts` MUST dispatch `ext_ui_decorator` (with or without `removed: true`) into a per-session reducer slot adjacent to the existing `uiModules` / `uiDataMap` state added by Phase 1. `removed: true` MUST delete the matching descriptor from the client state without affecting siblings.

`GateSlot` MUST grey out the matching `FlowLaunchDialog` item and render `payload.reason` as a hover tooltip when `available: false`. When two `gate` descriptors target the same `flowId`, the slot MUST render the most-restrictive aggregate: any `available: false` wins; reasons from all contributing descriptors are concatenated for display.

`BreadcrumbSlot` MUST render steps in the order declared by `payload.steps`. The active step (matching `payload.current`, or the first `status: "active"` step otherwise) MUST be visually highlighted; `status: "done"` steps MUST show a check; `status: "error"` steps MUST be rendered in an error style.

`ToastSlot` MUST stack concurrent toasts (no deduplication) and auto-dismiss each toast after `payload.durationMs` (default 5000ms; `0` means sticky until manually dismissed). The slot MUST cap the simultaneously-rendered toast count at 5; on overflow, the oldest visible toast MUST be evicted (FIFO). The server cache stores all toast descriptors regardless of the client display cap.

`AgentMetricSlot` MUST render `payload.text` directly under the matching `FlowAgentCard` (matched by `payload.agentId`). A descriptor whose `agentId` does not match any current agent MUST be silently ignored on the client without affecting other slots.

#### Scenario: Footer segment renders in session header
- **WHEN** `session.uiDecorators` contains `{ kind: "footer-segment", namespace: "judo", id: "model-state", payload: { text: "3 mut" } }`
- **THEN** `SessionHeader` renders "3 mut" in the footer-segment slot to the right of the git info

#### Scenario: Gate greys out flow launcher item
- **WHEN** a `gate` decorator has `payload: { flowId: "judo:save", available: false, reason: "Not in a judo workspace" }`
- **THEN** the matching `FlowLaunchDialog` item is rendered with disabled styling
- **AND** hovering the item shows the tooltip text "Not in a judo workspace"

#### Scenario: Toast auto-dismiss
- **WHEN** a `toast` decorator with `payload: { level: "info", message: "Done", durationMs: 1000 }` arrives
- **THEN** `ToastSlot` displays it and removes it from the rendered tray after 1000ms

#### Scenario: Removed flag unmounts a single decorator
- **WHEN** the client receives `ext_ui_decorator { descriptor: {kind:"footer-segment", namespace:"judo", id:"model-state"}, removed: true }` and one matching descriptor is currently rendered alongside others
- **THEN** the matching descriptor is unmounted and other footer-segment descriptors continue to render unchanged

#### Scenario: Most-restrictive gate wins on collision
- **WHEN** two `gate` descriptors target the same `flowId` and one declares `available: false` while the other declares `available: true`
- **THEN** `GateSlot` renders the item in the disabled (unavailable) state with the reason from the unavailable descriptor

### Requirement: Decorator invalidation rate SHALL be bounded

The bridge MUST cap per-session decorator-invalidation throughput at a default of 20 invalidations per second. Excess `ui:invalidate` events that would result in re-probing decorators within the rate window MUST be coalesced (the next probe runs at the end of the window) and the bridge MUST log a warning identifying the offending invalidation rate.

This cap applies to invalidation events that result in decorator changes; Phase 1 module-only probes are not subject to a separate cap.

#### Scenario: Burst of invalidations is coalesced
- **WHEN** an extension emits `ui:invalidate` 100 times within 200ms
- **THEN** the bridge runs at most a small bounded number of probes within that window (one at the start plus one trailing edge probe)
- **AND** the bridge logs a single warning naming the rate-cap event
