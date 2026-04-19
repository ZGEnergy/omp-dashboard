## ADDED Requirements

### Requirement: Handler exceptions are logged, not silently swallowed

The browser-gateway WebSocket message dispatcher SHALL distinguish between two failure modes:

1. A frame that is not valid JSON (malformed input). This MAY be silently dropped.
2. An exception thrown by an individual message handler while processing a parsed message. This SHALL be caught and logged with enough context to diagnose the failure. It SHALL NOT be silently swallowed.

The catch-all around the message-type `switch` that previously absorbed all exceptions SHALL be scoped so that only `JSON.parse` errors produce no log output. Handler exceptions SHALL emit a log line that includes the message type and the underlying error.

#### Scenario: Malformed JSON frame is silently dropped
- **WHEN** a browser WebSocket client sends a frame whose payload is not valid JSON
- **THEN** the dispatcher SHALL NOT throw
- **AND** the dispatcher SHALL NOT emit a handler-error log line

#### Scenario: Handler throws an exception during dispatch
- **WHEN** a browser WebSocket client sends a well-formed message of type `<T>`
- **AND** the handler for type `<T>` throws an error `E`
- **THEN** the dispatcher SHALL log an error line that includes the literal string `[browser-gw] handler error`, the message type `<T>`, and the error `E`
- **AND** the dispatcher SHALL remain running and continue to accept subsequent messages

#### Scenario: create_terminal handler throws because node-pty fails to spawn
- **WHEN** a browser sends `{ type: "create_terminal", cwd: "..." }`
- **AND** `terminalManager.spawn` throws (e.g. `posix_spawnp failed.`)
- **THEN** the dispatcher SHALL log an error containing `[browser-gw] handler error`, `type=create_terminal`, and the underlying error text
- **AND** the WebSocket connection SHALL remain open
