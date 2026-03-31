## MODIFIED Requirements

### Requirement: Race pattern for TUI sessions
For sessions where `ctx.hasUI` is `true`, the proxy SHALL race the original TUI dialog method against the dashboard response promise. The first resolution wins via `Promise.race`. When the dashboard wins, the proxy SHALL abort the TUI dialog by calling `abort()` on an `AbortController` whose signal was passed to the TUI call via `ExtensionUIDialogOptions.signal`. When the TUI wins, the proxy SHALL immediately delete the pending Map entry and send an `extension_ui_dismiss` message to the server so the dashboard can dismiss the stale dialog.

#### Scenario: Terminal answers first
- **WHEN** the user responds in the terminal before the dashboard
- **THEN** the original method's promise resolves first, `Promise.race` returns its value, the pending Map entry is deleted, and an `extension_ui_dismiss` message is sent to the server

#### Scenario: Dashboard answers first
- **WHEN** the dashboard user responds before the terminal
- **THEN** the dashboard promise resolves first, `Promise.race` returns its value, and the TUI dialog is dismissed via `AbortController.abort()`

#### Scenario: Both answer near-simultaneously
- **WHEN** both TUI and dashboard respond within the same event loop tick
- **THEN** `Promise.race` picks the first resolver, and the loser's cleanup handler fires immediately without error

### Requirement: Pending request tracking
The UI proxy SHALL maintain a `Map<requestId, { resolve, reject }>` of pending dialog requests. Each intercepted dialog call SHALL generate a unique `requestId` (UUID), store its promise resolver, and send an `extension_ui_request` message via the WebSocket connection. When the TUI wins a race, the entry SHALL be immediately deleted from the Map to prevent memory leaks.

#### Scenario: Dialog call creates pending request
- **WHEN** a wrapped dialog method (e.g., `confirm`) is called
- **THEN** the proxy SHALL generate a UUID `requestId`, store the resolver in the pending map, and send an `extension_ui_request` message

#### Scenario: Response resolves pending request
- **WHEN** an `extension_ui_response` message arrives with a matching `requestId`
- **THEN** the proxy SHALL resolve the stored promise with the response result and remove the entry from the pending map

#### Scenario: Unknown requestId response is ignored
- **WHEN** an `extension_ui_response` message arrives with a `requestId` not in the pending map
- **THEN** the proxy SHALL silently ignore it

#### Scenario: TUI wins race cleans up pending entry
- **WHEN** the TUI dialog resolves before the dashboard response
- **THEN** the proxy SHALL immediately delete the pending Map entry for that `requestId`

## ADDED Requirements

### Requirement: Extension UI dismiss protocol message
The extension→server protocol SHALL define `ExtensionUiDismissMessage` with fields: `type: "extension_ui_dismiss"`, `sessionId: string`, `requestId: string`. This message is sent by the bridge when the TUI wins a race, instructing the server to dismiss the corresponding dashboard dialog.

#### Scenario: Dismiss message sent when TUI wins
- **WHEN** the TUI dialog resolves before the dashboard
- **THEN** the bridge SHALL send an `extension_ui_dismiss` message with the matching `requestId`

#### Scenario: Server forwards dismiss to browser
- **WHEN** the server receives an `extension_ui_dismiss` for session X
- **THEN** the server SHALL forward a `ui_dismiss` message to all browser clients subscribed to session X

### Requirement: Server routes dismiss to browsers
The dashboard server SHALL forward `extension_ui_dismiss` messages from the bridge to all browser WebSocket clients subscribed to that session. The server→browser message SHALL use `BrowserUiDismissMessage` with fields: `type: "ui_dismiss"`, `sessionId: string`, `requestId: string`.

#### Scenario: Dismiss forwarded to subscribers
- **WHEN** the server receives an `extension_ui_dismiss` for session X
- **THEN** the server SHALL send a `ui_dismiss` message to all browser clients subscribed to session X

#### Scenario: No subscribers — dismiss is dropped
- **WHEN** the server receives an `extension_ui_dismiss` but no browser is subscribed
- **THEN** the server SHALL silently drop the message
