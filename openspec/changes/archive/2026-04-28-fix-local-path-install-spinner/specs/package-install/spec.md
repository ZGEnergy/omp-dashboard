## ADDED Requirements

### Requirement: Queue matches completion regardless of POST/WS arrival order

The client queue SHALL correctly match a `package_operation_complete` WebSocket message to its in-flight operation regardless of whether the message arrives before or after the corresponding HTTP POST response has resolved. When `running.operationId` is `null` (HTTP response not yet parsed), the queue SHALL match by `source` instead. When `running.operationId` is set, the queue SHALL continue to match by `operationId`.

This requirement closes a race window: for fast operations (notably local-path installs that have no network round-trip), the server's WebSocket broadcast can arrive before `fetch()` resolves the HTTP response body. Strict `operationId` matching during that window silently discards legitimate completions, leaving the spinner stuck and the queue blocked.

The same matching rule SHALL apply to `package_progress` messages so progress updates during the same window are not lost.

#### Scenario: Completion arrives before HTTP response (fast install)

- **WHEN** the queue starts an install operation by POSTing to `/api/packages/install`
- **AND** the server broadcasts `package_operation_complete` with the issued `operationId` BEFORE the client's `fetch()` resolves the response body
- **THEN** the queue matches the completion by `source` (since `running.operationId` is still `null`)
- **AND** the running op transitions to `success` (or `error` per the message payload)
- **AND** the spinner clears within one render tick

#### Scenario: Completion arrives after HTTP response (normal install)

- **WHEN** the queue starts an install operation
- **AND** the HTTP response resolves first, setting `running.operationId` to the issued id
- **AND** the server later broadcasts `package_operation_complete` with that same id
- **THEN** the queue matches by `operationId` and completes normally

#### Scenario: Progress event during race window updates running message

- **WHEN** the queue is mid-POST for an operation whose `running.operationId` is still `null`
- **AND** a `package_progress` message for that operation arrives via WebSocket
- **THEN** the queue updates `running.message` based on the progress event using `source` to match
- **AND** later progress messages (after `operationId` is set) match by `operationId` as before

#### Scenario: Local-path install does not orphan its spinner

- **WHEN** the user clicks Install on a local-path source (e.g. `/home/user/my-extension`)
- **AND** the install completes server-side in milliseconds, faster than the HTTP response round-trip
- **THEN** the spinner clears on completion and does not remain in the `running` state indefinitely
- **AND** subsequent enqueues for any other source proceed normally

#### Scenario: Mismatched completion is still ignored

- **WHEN** a `package_operation_complete` arrives whose `operationId` does not match `running.operationId` AND whose `source` does not match `running.source`
- **THEN** the queue ignores the message and the running op is unaffected
