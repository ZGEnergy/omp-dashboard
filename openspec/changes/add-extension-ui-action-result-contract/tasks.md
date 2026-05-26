# Tasks

## 1. Protocol

- [ ] 1.1 Add `UiManagementResultMessage` to `packages/shared/src/protocol.ts` and `browser-protocol.ts`. Include in `ExtensionToServerMessage` and `ServerToBrowserMessage` unions.
- [ ] 1.2 Add optional `reqId: string` to `UiManagementMessage`. Mark as optional for one minor release; flip to required in the next major.
- [ ] 1.3 Export new types from `@blackbelt-technology/pi-dashboard-shared`.

## 2. Bridge

- [ ] 2.1 In `ui-modules.ts:handleUiManagement`, inject `_result(payload)` alongside the existing `_reply(items)`. Validate `payload.ok` is boolean; warn-and-drop otherwise.
- [ ] 2.2 Forward the populated result as `ui_management_result { reqId, sessionId, ok, error?, fieldErrors?, refresh?, close? }`. Use the `reqId` echoed in `msg.reqId`; if missing, generate `"legacy-${counter}"` and warn once per session.
- [ ] 2.3 If neither `_result` nor `_reply` nor synchronous `data.items` fires within 30 s, emit a synthetic `{ ok: true }` and warn. Make the timeout configurable via `pi.events.emit("ui:configure", { actionTimeoutMs })`.

## 3. Server

- [ ] 3.1 In `event-wiring.ts`, forward `ui_management_result` to every browser subscribed to the session. Do NOT cache (terminal per-request).
- [ ] 3.2 Drop result messages whose `reqId` has not been seen recently (LRU of last 256 ids per session) to prevent replay-storm exploits. Warn on drop.

## 4. Client

- [ ] 4.1 In `GenericExtensionDialog`, generate `reqId = crypto.randomUUID()` on every dispatch. Track `Map<reqId, { actionId, fieldKeys }>`.
- [ ] 4.2 On `ui_management_result`:
  - `ok: true, close: true` → unmount modal
  - `ok: true, refresh: [event,...]` → dispatch `ui_management { action: "list", event }` for each
  - `ok: false, error` → render dismissible error banner at the top of the dialog
  - `ok: false, fieldErrors` → render error text under matching `UiField` keys
- [ ] 4.3 Show a button-level spinner on the originating `UiAction` while its `reqId` is pending.
- [ ] 4.4 Clear pending entries older than 60 s defensively (in case the result message is dropped).

## 5. Tests

- [ ] 5.1 Bridge: `_result({ok: true})` produces matching `ui_management_result`.
- [ ] 5.2 Bridge: synchronous `data.items` is mapped to `{ok: true}` for `action: "list"`.
- [ ] 5.3 Bridge: 30 s timeout produces synthetic success + warning.
- [ ] 5.4 Server: forwards result; drops unknown `reqId`.
- [ ] 5.5 Client: per-`reqId` button spinner; error banner; field errors; refresh; close.
- [ ] 5.6 Client: two concurrent actions on the same modal resolve independently.

## 6. Documentation

- [ ] 6.1 Update `openspec/specs/extension-ui-system/spec.md` on archive.
- [ ] 6.2 Add migration note in `docs/architecture.md`'s Extension UI System section.
- [ ] 6.3 Update `dashboard-plugin-skill` scaffold templates to use `_result` instead of bare `_reply` for mutating actions.
