## Why

The current module contract has three lifecycle holes that block production use:

1. **No `removed: true` for modules.** Decorators support per-key removal (`ext_ui_decorator { removed: true }`); modules do not. The only way to retract one module is to omit it from the next probe, which means an extension that wants to retract a single module must re-emit every other module too. Disruptive when modules carry expensive `dataEvent` round-trips.

2. **No cross-extension `command` collision rule.** Phase-1 spec covers built-in-vs-module collisions ("Built-in command takes precedence") but is silent on two extensions registering `command: "/status"`. The current implementation does last-write-wins on `id` only — `command` is not part of the collision key. Two extensions with the same `command` and different `id`s both register; whichever the dashboard's command-router matches first wins, deterministically unpredictable across reconnects.

3. **No modal-close event back to extensions.** When the user dismisses `GenericExtensionDialog`, the extension is never notified. Forms with in-progress draft state cannot release locks, cancel uploads, or roll back optimistic changes. Phase-1 deferred this; production use demands it.

This change closes all three holes with one consistent lifecycle protocol.

## What Changes

- **NEW**: `removed: true` flag on `ui_modules_list` entries. Per-module retract — server treats it as "delete this `id` from `Session.uiModules`" without affecting siblings.
- **NEW**: Bridge SHALL detect `(command, ...)` collisions across modules in one probe and across probes. Last-write-wins inside one probe with a warning; across probes (different extensions registered different modules with same command), bridge SHALL emit a warning AND `ui_modules_list` SHALL include only the first-registered module for that command. Order is determined by `module.id` lexicographic order to make the choice deterministic across reconnects.
- **NEW**: `ui:modal-closed` event emitted on `pi.events` by the bridge when the dashboard reports a modal dismissal. Payload `{ moduleId, reason: "user" | "navigate-away" | "session-end" }`. Extensions opt in by listening; no listeners means no-op.
- **NEW**: Client → server `ui_modal_closed { sessionId, moduleId, reason }` message; server forwards to bridge.
- **NEW**: Server SHALL emit `ui_modal_closed` with `reason: "session-end"` on `session_end` for every module currently open in any subscribed browser. The bridge SHALL re-emit on `pi.events`; extensions clean up.

## Capabilities

### Modified Capabilities

- `extension-ui-system`: module schema gains `removed: true`; bridge gains command-collision rule; protocol gains `ui_modal_closed`.

## Impact

- `packages/shared/src/protocol.ts` and `browser-protocol.ts` — `UiModulesListEntry` becomes a discriminated union of `ExtensionUiModule | { id, removed: true }`. New `UiModalClosedMessage`.
- `packages/extension/src/ui-modules.ts` — probe partition logic gains `removed: true` short-circuit for modules; `command` collision detector emits warning + filters; new `handleUiModalClosed(ctx, msg)` re-emits on `pi.events`.
- `packages/server/src/event-wiring.ts` — handle module `removed: true` (delete key from `session.uiModules`); handle `ui_modal_closed` browser → server (forward to bridge); emit `ui_modal_closed { reason: "session-end" }` on session teardown for every module open in subscribed browsers.
- `packages/client/src/components/extension-ui/GenericExtensionDialog.tsx` — on `onClose`, send `ui_modal_closed { sessionId, moduleId, reason: "user" }`. On route change away from session, send `reason: "navigate-away"`.
- Tests covering all three lifecycle paths.

Rollback considerations:

- All three additions are backward compatible — extensions and bridges that don't implement them continue to work exactly as today.
- `command` collision filter is the only behavior change; deterministic by `id` lexicographic order. Worst-case impact: one extension's modal stops opening; user gets a clear console warning explaining why.
