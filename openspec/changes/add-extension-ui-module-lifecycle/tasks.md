# Tasks

## 1. Protocol

- [ ] 1.1 Update `UiModulesListMessage.modules` element type to `ExtensionUiModule | { id: string; removed: true }`. Document the discriminator.
- [ ] 1.2 Add `UiModalClosedMessage { type: "ui_modal_closed"; sessionId; moduleId; reason: "user" | "navigate-away" | "session-end" }`. Include in both `BrowserToServerMessage` and `ServerToExtensionMessage` unions.

## 2. Bridge

- [ ] 2.1 In `refreshUiModules`, recognize `{ id, removed: true }` entries in the probe and forward them through `ui_modules_list` without further validation.
- [ ] 2.2 Add `commandByModuleId: Map<string, string>` accumulator during partition. On finding two modules with the same `command`, keep the one whose `id` is lexicographically smaller; warn naming both module ids and the colliding command.
- [ ] 2.3 Add `handleUiModalClosed(ctx, msg)` that emits `pi.events.emit("ui:modal-closed", { moduleId, reason })`. Wrap in try/catch.
- [ ] 2.4 Wire `ui_modal_closed` into the bridge's server-message dispatch switch.

## 3. Server

- [ ] 3.1 In `event-wiring.ts` handler for `ui_modules_list`, process entries with `removed: true` by deleting the matching `id` from `session.uiModules` (no-op if absent). Re-broadcast the message verbatim so clients can clear local state too.
- [ ] 3.2 Add a per-session `Map<browserId, Set<moduleId>>` of "currently-open modals." Update on `ui_modal_closed` from browsers.
- [ ] 3.3 On `session_end`, iterate the open-modal map and forward one `ui_modal_closed { reason: "session-end" }` per open `(browser, moduleId)` to the bridge.
- [ ] 3.4 Forward `ui_modal_closed { reason: "user" | "navigate-away" }` from browsers to the owning bridge via `piGateway.sendToSession`.

## 4. Client

- [ ] 4.1 Track the currently-open module in `App.tsx` (already does via `extensionUiOpenModule` state). On `onClose`, send `ui_modal_closed { sessionId, moduleId, reason: "user" }` before clearing state.
- [ ] 4.2 On `sessionId` change while a modal is open, send `reason: "navigate-away"` for the previously-open modal before unmounting.
- [ ] 4.3 On receipt of `ui_modules_list` whose entries include `{ id, removed: true }`, delete matching `id` from the per-session `uiModules` slice; if the deleted id matches the currently-open modal, close the modal (no extra `ui_modal_closed` — server already knows the session is going away or the user already triggered the close).

## 5. Tests

- [ ] 5.1 Bridge: probe pushing `{ id: "x", removed: true }` produces `ui_modules_list` with that entry forwarded verbatim.
- [ ] 5.2 Bridge: two modules with same `command` produce one filtered forward + one warning; lexicographic `id` wins.
- [ ] 5.3 Bridge: `handleUiModalClosed` re-emits on `pi.events`; listener throw is caught.
- [ ] 5.4 Server: `removed: true` entry deletes from `session.uiModules`; siblings preserved.
- [ ] 5.5 Server: `session_end` emits one `ui_modal_closed { reason: "session-end" }` per open `(browser, moduleId)`.
- [ ] 5.6 Client: dismissing modal sends `ui_modal_closed { reason: "user" }`.
- [ ] 5.7 Client: navigating to another session while a modal is open sends `reason: "navigate-away"`.

## 6. Documentation

- [ ] 6.1 Update `docs/architecture.md` "Extension UI System" with the lifecycle protocol diagram.
- [ ] 6.2 Add a "Cleanup on dismiss" recipe to the `dashboard-plugin-skill` references.
