## Why

Phase 2 of the Generalized Extension UI System (see design `extension-ui-system`). Implements five live in-page decoration slots that extensions can register via the same `ui:list-modules` probe established in Phase 1:

- `footer-segment` — live string in the session header (e.g. pi-judo "3 mut")
- `agent-metric` — live string under `FlowAgentCard` (e.g. pi-judo "query:5 │ mut:2 │ saved")
- `breadcrumb` — workflow pipeline visualization above `FlowDashboard` (e.g. judo-sdd 5-stage pipeline)
- `gate` — flow availability state inline in `FlowLaunchDialog` (e.g. pi-judo "Not in a judo workspace")
- `toast` — one-shot notification in a top-right toast tray

These cover the live-decoration use cases pi-judo and pi-flows extensions need today but which Phase 1's slash-command-triggered modal cannot host.

This change DEPENDS ON `add-extension-ui-modal` being shipped first.

## What Changes

- **NEW**: Single-union `ext_ui_decorator` protocol message carrying a discriminated `kind` payload for all five live decoration types.
- **NEW**: `Session.uiDecorators?: Record<string, DecoratorDescriptor>` keyed by `${kind}:${namespace}:${id}` for server-side caching and replay.
- **NEW**: Explicit `namespace` field on decorator descriptors; bridge logs collision warning on `(namespace, id)` overlap within a single probe.
- **NEW**: Client components in `packages/client/src/components/extension-ui/`:
  - `FooterSegmentSlot.tsx` mounted in `SessionHeader.tsx` (right of git info)
  - `AgentMetricSlot.tsx` mounted under `FlowAgentCard.tsx`
  - `BreadcrumbSlot.tsx` mounted at the top of `FlowDashboard.tsx`
  - `GateSlot.tsx` rendered inline in `FlowLaunchDialog.tsx` (greys out unavailable flows with `reason` tooltip)
  - `ToastSlot.tsx` mounted in `App.tsx` (top-right tray)
- **NEW**: Decorator removal semantics — extensions push descriptor with `removed: true` to delete a previously-registered descriptor. Server deletes the cache entry and forwards removal.
- **NEW**: Decorator-bearing modules update existing `refreshUiModules()` in the bridge to extract `kind: "footer-segment" | ... | "toast"` modules and forward as `ext_ui_decorator` (instead of accumulating into `ui_modules_list` which remains for `kind: "management-modal"` only).

## Capabilities

### New Capabilities

None — extends `extension-ui-system` (created in Phase 1).

### Modified Capabilities

- `extension-ui-system`: adds Requirements for all five decorator kinds, the `ext_ui_decorator` wire format, and the namespace collision behavior.

## Impact

- `packages/shared/src/types.ts` — add `DecoratorDescriptor` discriminated union and per-kind payload types; add `Session.uiDecorators?`.
- `packages/shared/src/browser-protocol.ts` and `protocol.ts` — add `ExtUiDecoratorMessage` (single-union).
- `packages/extension/src/bridge.ts` — partition probe results into modules vs decorators; forward each on its own protocol message.
- `packages/server/src/event-wiring.ts` — handle `ext_ui_decorator` from extension; key cache; forward to subscribers; handle `removed: true`.
- `packages/server/src/browser-handlers/subscription-handler.ts` — extend `replayUiState()` to replay decorators alongside modules.
- `packages/client/src/components/extension-ui/` — five new slot components.
- `packages/client/src/hooks/useMessageHandler.ts` — dispatch `ext_ui_decorator` into per-kind state in session state.
- `packages/client/src/components/SessionHeader.tsx`, `FlowDashboard.tsx`, `FlowAgentCard.tsx`, `FlowLaunchDialog.tsx`, `App.tsx` — mount the slot components.

## References

- Design: `openspec/changes/extension-ui-system/design.md`
- Phase 1: `openspec/changes/add-extension-ui-modal/`
- pi-flows adoption (Phase 3, separate repo): pushes `breadcrumb`, `gate`, `agent-metric` decorators automatically for any flow-using extension.
- pi-judo adoption (Phase 3 consumer, separate repo): pushes `footer-segment` and additional `agent-metric` decorators alongside existing TUI registrations.
