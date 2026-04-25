## Why

Phase 1 of the Generalized Extension UI System (see design `extension-ui-system`). Implements the `management-modal` slot — schema-driven, slash-command-triggered modal with `table` / `grid` / `form` views, replayed on browser reconnect.

This is the most-requested ergonomics improvement for extensions: replacing TUI-only `ctx.ui.custom` overlays and chat-only command output with rich, navigable management UIs that the dashboard renders without per-extension React work.

## What Changes

- **NEW**: Pull-based discovery probe in the bridge — emit `ui:list-modules` on `session_start`, after every reconnect, and on `ui:invalidate { id }`. Forward populated `probe.modules` as `ui_modules_list` protocol message.
- **NEW**: `ExtensionUiModule` / `UiView` / `UiField` / `UiAction` / `UiSection` types in `@blackbelt-technology/pi-dashboard-shared`. Field types: `text | number | boolean | select | code | datetime | textarea`. View types this phase: `table | grid | form`.
- **NEW**: Wire protocol messages: `ui_modules_list`, `ui_data_list`, `ui_management`. Naming inherits from PR #15's prototype for migration cost.
- **NEW**: Server-side caching on the `Session` record: `session.uiModules`, `session.uiDataMap`. Replay site: `replayUiState(ws, sessionId)` in `handleSubscribe`, after `replayPendingUiRequests`.
- **NEW**: Client component `GenericExtensionDialog.tsx` rendering modules; slash-command interception in `CommandInput.tsx` / `SessionHeader.tsx` matching exact `module.command` strings.
- **NEW**: MDI icon vocabulary (`@mdi/js`); Tailwind `ConfirmDialog` for action `confirm:` polish (replaces PR #15's `window.confirm()`).
- **NOT INTRODUCED**: live decoration slots (footer-segment, agent-metric, breadcrumb, gate, toast) — those land in `add-extension-ui-decorations`.
- **NOT INTRODUCED**: ragger's richer view types (`search`, `metrics`, `detail`) — separate follow-up change.
- **NOT INTRODUCED**: RJSF form view — `add-extension-ui-rjsf-form`.
- **NOT INTRODUCED**: pi-flows or pi-judo adoption — separate changes in those repos.

## Capabilities

### New Capabilities

- `extension-ui-system`: discovery probe, module schema, replay-on-subscribe, slash-command interception. (Spec stub already exists from `extension-ui-system` design change; this change populates Phase 1 requirements.)

### Modified Capabilities

None. The existing `interactive-ui-dialogs`, `ui-proxy`, and `extension-ui-forwarding` capabilities remain unchanged.

## Impact

- `packages/shared/src/types.ts` — add `ExtensionUiModule`, `UiView`, `UiField`, `UiAction`, `UiSection`; add `Session.uiModules?` and `Session.uiDataMap?` fields.
- `packages/shared/src/protocol.ts` — add `UiModulesListMessage`, `UiDataListMessage`.
- `packages/shared/src/browser-protocol.ts` — add corresponding browser-bound and browser-originated messages.
- `packages/extension/src/bridge.ts` — `refreshUiModules()` on session start and reconnect; listen for `ui:invalidate`; route `ui_management` back via `pi.events.emit`.
- `packages/server/src/event-wiring.ts` — handle `ui_modules_list` / `ui_data_list` from extension; cache on Session; forward to subscribers.
- `packages/server/src/browser-handlers/subscription-handler.ts` — add `replayUiState(ws, sessionId)`.
- `packages/server/src/browser-handlers/...` — handle `ui_management` from browser.
- `packages/client/src/components/extension-ui/GenericExtensionDialog.tsx` — new file.
- `packages/client/src/components/SessionHeader.tsx` and `CommandInput.tsx` — slash-command interception.
- `docs/architecture.md` — promote the "(planned)" section to "(Phase 1 shipped)" and document the implemented surface.
- `AGENTS.md` — add Key Files entry for the new component and protocol messages.

## References

- Design: `openspec/changes/extension-ui-system/design.md`
- Prototype: PR #15 (`feat: implement Generalized Extension UI System (Hybrid Schema)` + `feat: enhance generalized UI with description, sections, and categories`) — reference only, not merged. Commits `55bbba8` and `d623eb3` contain code patterns worth lifting verbatim where they match `develop`.
