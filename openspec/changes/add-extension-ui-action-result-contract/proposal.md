## Why

`ui_management` (browser → extension) is currently fire-and-forget. The bridge only round-trips back when the extension's listener populates `data.items` (or calls `data._reply(items)`), which produces a `ui_data_list` refresh. Mutating actions — delete, save, run-task — have no result channel. Consequences in the current implementation:

- Modals show no loading spinner while an action is in flight; the click feels stuck.
- Extension-side validation errors cannot surface back into the form (no field-level error path).
- Refresh-after-action requires the extension to remember to emit `ui:invalidate`; if it forgets, the table goes stale.
- "Close on success" cannot be expressed; modals have to be dismissed manually after every successful action.
- No correlation between request and response — two concurrent clicks on the same modal cannot be disambiguated.

This change adds an explicit reply message so the dashboard can render loading state, surface errors, refresh declaratively, and optionally auto-close on success.

## What Changes

- **NEW**: `ui_management_result` message (extension → server → browser) carrying `{ reqId, sessionId, ok, error?, fieldErrors?, refresh?, close? }`.
- **NEW**: `ui_management` gains a required `reqId: string` field (client-generated, opaque to the bridge). Existing `action: "list"` traffic carries a `reqId` and the bridge echoes it on the resulting `ui_data_list` (additive field, optional on the wire for backward compatibility during rollout).
- **NEW**: Bridge `handleUiManagement` passes a structured `_result` helper to the extension listener:
  ```ts
  data._result({ ok: true, refresh: ["judo:status-rows"], close: true });
  data._result({ ok: false, error: "Workspace locked", fieldErrors: { name: "Required" } });
  ```
  Synchronous `data.items` continues to work for `action: "list"` and is treated as `{ ok: true }`.
- **NEW**: `GenericExtensionDialog` renders in-flight state per `reqId`, surfaces `error` as a banner, applies `fieldErrors` next to matching `UiField` keys, dispatches `ui_management` for each entry in `refresh[]`, and unmounts on `close: true`.
- **NOT INTRODUCED**: streaming/progress events. One request → one terminal result; long-running work uses `ui:invalidate` from the extension side.

## Capabilities

### Modified Capabilities

- `extension-ui-system`: action-dispatch protocol now has a result contract. Phase-1 view-rendering requirements gain loading / error / refresh / close behavior.

## Impact

- `packages/shared/src/protocol.ts` and `browser-protocol.ts` — new `UiManagementResultMessage`; `UiManagementMessage` gains `reqId`.
- `packages/extension/src/ui-modules.ts` — `handleUiManagement` injects `_result` alongside `_reply`; rejects malformed `reqId`.
- `packages/server/src/event-wiring.ts` — forward `ui_management_result` to subscribed browsers; no caching (terminal per-request).
- `packages/client/src/components/extension-ui/GenericExtensionDialog.tsx` — per-`reqId` pending map; banner + `fieldErrors` rendering; refresh dispatch; close-on-success.
- Tests: per-`reqId` correlation, error rendering, refresh dispatch, close behavior.

Backward compatibility: extensions that never call `_result` continue to work — the dashboard treats them as fire-and-forget with implicit `{ ok: true }` after a short timeout (default 30 s; configurable per modal). A `console.warn` flags such extensions to encourage migration.
