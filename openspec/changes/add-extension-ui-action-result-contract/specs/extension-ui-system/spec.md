## ADDED Requirements

### Requirement: ui_management messages SHALL carry a client-generated reqId

Every `ui_management` message produced by the client MUST include `reqId: string` (typically `crypto.randomUUID()`). The server SHALL forward `reqId` verbatim. The bridge SHALL echo `reqId` on the resulting `ui_management_result` and (for `action: "list"`) on the resulting `ui_data_list`.

During a one-minor-release deprecation window, `reqId` MAY be absent on the wire; bridges receiving a `ui_management` without `reqId` SHALL synthesize `"legacy-${counter}"` and log a one-shot warning per session naming the extension `module.id`. After the deprecation window, missing `reqId` SHALL be a protocol error and the message SHALL be dropped with a warning.

#### Scenario: Client generates a unique reqId per dispatch
- **WHEN** the user clicks two different actions in `GenericExtensionDialog`
- **THEN** the client sends two `ui_management` messages whose `reqId` values are distinct UUIDs

#### Scenario: Bridge echoes reqId on result
- **WHEN** the bridge processes `ui_management { reqId: "abc", event, action }` and the extension calls `data._result({ ok: true })`
- **THEN** the bridge sends `ui_management_result { reqId: "abc", sessionId, ok: true }`

#### Scenario: Legacy reqId-less message produces a warning
- **WHEN** a `ui_management` without `reqId` reaches the bridge during the deprecation window
- **THEN** the bridge synthesizes `"legacy-1"` (incrementing), warns once per session naming the module id, and proceeds normally

### Requirement: Bridge SHALL provide a _result helper on action dispatch

When the bridge re-emits `pi.events.emit(event, data)` for a `ui_management` message, `data` MUST include a `_result(payload)` function alongside the existing `_reply(items)` function. `_result` SHALL accept a payload conforming to `UiManagementResult` and forward it as `ui_management_result`. Calling `_result` more than once for a single request SHALL be a no-op after the first call (with a warning).

If the extension's listener throws, the bridge SHALL log the error and emit `ui_management_result { ok: false, error: "extension handler threw" }`. If neither `_result` nor `_reply` nor synchronous `data.items` produces output within the configured action timeout (default 30000 ms), the bridge SHALL emit a synthetic `ui_management_result { ok: true }` and log a warning naming the module id.

#### Scenario: Explicit failure result
- **WHEN** an extension calls `data._result({ ok: false, error: "Workspace locked" })`
- **THEN** the bridge sends `ui_management_result { reqId, sessionId, ok: false, error: "Workspace locked" }`

#### Scenario: Listener throw becomes failure result
- **WHEN** an extension's `ui_management` listener throws `new Error("boom")`
- **THEN** the bridge logs the error and sends `ui_management_result { ok: false, error: "extension handler threw" }`

#### Scenario: Timeout produces synthetic success
- **WHEN** an extension's listener returns without calling `_result`, `_reply`, or setting `data.items` within 30000 ms
- **THEN** the bridge sends `ui_management_result { ok: true }` and logs a one-shot warning per `(module.id, event)` pair

#### Scenario: Double-call to _result is rejected
- **WHEN** an extension calls `data._result(...)` twice for the same request
- **THEN** only the first call produces a `ui_management_result`; the second is dropped with a console warning

### Requirement: Wire protocol SHALL include ui_management_result

The shared package MUST export `UiManagementResultMessage`:

```ts
interface UiManagementResultMessage {
  type: "ui_management_result";
  reqId: string;
  sessionId: string;
  ok: boolean;
  error?: string;                       // human-readable, shown as banner
  fieldErrors?: Record<string, string>; // keyed by UiField.key
  refresh?: string[];                   // dataEvent names to re-fetch
  close?: boolean;                      // unmount the modal after applying
}
```

The message MUST appear in both the `ExtensionToServerMessage` and `ServerToBrowserMessage` unions. The server MUST NOT cache `ui_management_result`; results are terminal per-request.

The server SHALL maintain an LRU of the last 256 `reqId`s seen per session and drop any result whose `reqId` is not present in the LRU, with a one-shot warning per `reqId`. This prevents replay storms from a compromised bridge.

#### Scenario: Result propagates extension → browser
- **WHEN** the bridge sends `ui_management_result { reqId: "x", sessionId: "s1", ok: true, refresh: ["judo:rows"] }`
- **THEN** the server forwards the message to every browser subscribed to `s1` without caching

#### Scenario: Unknown reqId is dropped
- **WHEN** the server receives `ui_management_result { reqId: "never-seen" }`
- **THEN** the server drops the message, logs a one-shot warning naming the `reqId`, and forwards nothing

### Requirement: GenericExtensionDialog SHALL render result-driven state

`GenericExtensionDialog` MUST maintain a `Map<reqId, PendingAction>` of in-flight dispatches. On every `ui_management` send, the originating `UiAction` button MUST render a spinner and SHALL be disabled until the matching result arrives or 60 s elapse (defensive client-side GC).

On `ui_management_result` arrival, the client MUST apply each declared effect:

- `ok: true, close: true` → unmount the modal (parent `onClose` invoked).
- `ok: true, refresh: [event, ...]` → dispatch `ui_management { action: "list", event, reqId: <new uuid> }` for each event.
- `ok: false, error: <string>` → render a dismissible error banner at the top of the dialog body with the error text.
- `ok: false, fieldErrors: { key: msg }` → render `msg` in error styling beneath each `UiField` matching `key`. Unknown keys SHALL be logged and ignored.

A single result MAY combine multiple effects (e.g. `ok: false, error`, `fieldErrors` — banner plus per-field errors).

#### Scenario: Successful action with refresh and close
- **GIVEN** the user clicks a `Save` action in a form view
- **WHEN** the bridge sends `ui_management_result { reqId, ok: true, refresh: ["judo:list-models"], close: true }`
- **THEN** the dialog dispatches `ui_management { action: "list", event: "judo:list-models" }` and then unmounts

#### Scenario: Validation error surfaces per field
- **WHEN** the bridge sends `ui_management_result { reqId, ok: false, fieldErrors: { name: "Required", endpoint: "Invalid URL" } }`
- **THEN** the form renders "Required" beneath the `name` field and "Invalid URL" beneath the `endpoint` field
- **AND** no error banner is rendered (because `error` is absent)

#### Scenario: Button spinner clears on result
- **WHEN** the user clicks an action and the bridge takes 2000 ms to respond
- **THEN** the action button shows a spinner during the 2000 ms window
- **AND** the spinner clears the instant `ui_management_result` arrives for that `reqId`

#### Scenario: Pending entries garbage-collected after 60 s
- **WHEN** the bridge fails to deliver a result for an in-flight `reqId`
- **THEN** the client clears the pending entry after 60 s, re-enables the button, and logs a one-shot warning naming the action id
