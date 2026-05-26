## ADDED Requirements

### Requirement: Modules SHALL support per-id removal via removed:true entry

`UiModulesListMessage.modules[]` MUST accept entries of either shape:

- Full descriptor: `ExtensionUiModule` (existing).
- Removal: `{ id: string; removed: true }`.

When the server receives a `ui_modules_list` containing one or more removal entries, it MUST delete the matching `id`s from `session.uiModules` (no-op if absent) and re-broadcast the message verbatim so subscribed browsers can update their local state. Full-descriptor entries and removal entries MAY coexist in the same message.

The client MUST process removal entries by deleting matching `id`s from its per-session `uiModules` slice. If the currently-open modal's `moduleId` matches a removed `id`, the modal MUST unmount silently (no additional `ui_modal_closed` — the removal is the close signal).

#### Scenario: Removal deletes matching id without affecting siblings
- **GIVEN** a session whose `uiModules` contains `[mA, mB, mC]`
- **WHEN** the bridge forwards `ui_modules_list { modules: [{ id: "B", removed: true }] }`
- **THEN** the server's `session.uiModules` becomes `[mA, mC]` and the same removal entry is broadcast to subscribers

#### Scenario: Removal of an unknown id is a no-op
- **WHEN** the bridge forwards a removal for an `id` not present in `session.uiModules`
- **THEN** the server takes no cache action and still broadcasts the message verbatim

#### Scenario: Removal unmounts the open modal
- **GIVEN** a browser is currently rendering `GenericExtensionDialog` for `moduleId: "B"`
- **WHEN** the client receives `ui_modules_list { modules: [{ id: "B", removed: true }] }`
- **THEN** the dialog unmounts and no `ui_modal_closed` is sent

### Requirement: Bridge SHALL resolve command collisions deterministically

When two or more `management-modal` modules in the same probe (or accumulated across probes within one session) declare the same `command` string, the bridge MUST forward exactly one module for that command. Selection rule: the module whose `id` is lexicographically smallest (`<`). The other module(s) SHALL be omitted from `ui_modules_list` with a single warning per `(command, ...losers)` tuple.

The warning text MUST include the chosen winner's `id`, the loser ids, and the command. Example: `extension-ui: command "/status" registered by modules ["judo-status","ragger-status"] — keeping "judo-status" (lexicographic id wins); "ragger-status" suppressed`.

This rule applies BEFORE the existing built-in-command precedence rule. The order of resolution is:

1. Built-in command (e.g. `/model`, `/compact`) wins over all modules — existing rule.
2. Among multiple modules declaring a non-built-in command, lexicographically smallest `id` wins — new rule.

#### Scenario: Two modules same command — smaller id wins
- **WHEN** the probe pushes `{ id: "ragger-status", command: "/status", ... }` and `{ id: "judo-status", command: "/status", ... }`
- **THEN** the bridge forwards `ui_modules_list` containing only `judo-status`
- **AND** logs one warning naming both ids and the command

#### Scenario: Built-in precedence preserved
- **WHEN** the probe pushes a module with `command: "/model"`
- **THEN** the bridge MAY forward the module (no collision filter applies), but the client's slash-command interception SHALL prefer the built-in `/model` handler per the Phase-1 spec

### Requirement: Wire protocol SHALL include ui_modal_closed

The shared package MUST export `UiModalClosedMessage`:

```ts
interface UiModalClosedMessage {
  type: "ui_modal_closed";
  sessionId: string;
  moduleId: string;
  reason: "user" | "navigate-away" | "session-end";
}
```

The message MUST appear in both `BrowserToServerMessage` and `ServerToExtensionMessage` unions.

#### Scenario: User dismisses modal
- **WHEN** the user clicks the backdrop, presses Esc, or clicks the close button on `GenericExtensionDialog`
- **THEN** the client sends `ui_modal_closed { sessionId, moduleId, reason: "user" }` BEFORE unmounting the dialog component

#### Scenario: Browser switches sessions while modal open
- **WHEN** the user navigates to a different session while a modal is open in the current session
- **THEN** the client sends `ui_modal_closed { sessionId: <previous>, moduleId, reason: "navigate-away" }` before unmounting

### Requirement: Server SHALL track open modals and fan out session-end close events

The server MUST maintain `session.openModalsByBrowser?: Map<browserId, Set<moduleId>>` updated as follows:

- On `ui_modal_closed { reason: "user" | "navigate-away" }` from a browser: delete the `moduleId` from that browser's set.
- On subscription disconnect (browser WebSocket closes): forward one `ui_modal_closed { reason: "navigate-away" }` per open `moduleId` to the bridge, then drop the entry.
- On the client's first `ui_management` for a module: add the `moduleId` to the originating browser's set (the client did not previously emit an explicit "open" event; this is the cheapest derivable signal).

On `session_end`, the server MUST iterate `openModalsByBrowser` for that session and forward one `ui_modal_closed { reason: "session-end" }` per `(browser, moduleId)` pair to the bridge, then clear the map.

The bridge SHALL re-emit each received `ui_modal_closed` as `pi.events.emit("ui:modal-closed", { moduleId, reason })`, wrapped in try/catch.

#### Scenario: Session-end fans out close events
- **GIVEN** session `s1` has two browsers each with one open modal (`mA` in browser B1, `mB` in browser B2)
- **WHEN** `session_end` fires for `s1`
- **THEN** the server forwards two `ui_modal_closed { reason: "session-end" }` messages to the bridge — one for `mA` and one for `mB`
- **AND** the bridge re-emits both on `pi.events`

#### Scenario: Browser disconnect emits navigate-away
- **GIVEN** browser B1 has modal `mA` open in session `s1`
- **WHEN** B1's WebSocket closes unexpectedly
- **THEN** the server forwards `ui_modal_closed { sessionId: "s1", moduleId: "mA", reason: "navigate-away" }` to the bridge

#### Scenario: Extension listener throw is isolated
- **WHEN** the bridge processes a `ui_modal_closed` and an extension's `ui:modal-closed` listener throws
- **THEN** the bridge logs the error and continues; other extensions' listeners run normally
