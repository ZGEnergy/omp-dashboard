## ADDED Requirements

### Requirement: Shared push trigger predicate and gate

The dashboard SHALL use the existing `isUnreadTrigger` result and the existing any-viewer/non-replay gate for push fanout. The push consumer SHALL remain co-located with the unread consumer in `event-wiring.ts`; it MUST NOT define a second attention predicate or alter `isUnreadTrigger`.

#### Scenario: Agent finishes a turn → push fired
- **WHEN** a session transitions from `streaming` to `idle` or `active`, no browser views the session, and the event is not replay
- **THEN** `PushDispatcher.fanout(sessionId, event)` SHALL be called exactly once

#### Scenario: Agent waits for input → push fired
- **WHEN** `currentTool` changes to `ask_user` or core `ask` from a non-input-needed tool under the same gate
- **THEN** `fanout(sessionId, event)` SHALL be called exactly once

#### Scenario: Agent crashes → push fired
- **WHEN** an `agent_end` event has a truthy `payload.error` under the same gate
- **THEN** `fanout(sessionId, event)` SHALL be called exactly once

#### Scenario: Browser is viewing the session → no push
- **WHEN** a trigger predicate fires and `viewedSessionTracker.isViewedByAnyone(sessionId) === true`
- **THEN** `fanout` SHALL NOT be called

#### Scenario: Replay event → no push
- **WHEN** a replay event matches a trigger predicate
- **THEN** `fanout` SHALL NOT be called

### Requirement: Fire-and-forget dispatch

`PushDispatcher.fanout(sessionId, event)` SHALL be `void`-returning at the type level and SHALL NOT throw under any input. The existing event-wiring call site MUST NOT await it. Web Push transport latency or failure MUST NOT delay or block WebSocket fanout to connected browsers.

#### Scenario: Web Push transport hangs indefinitely
- **WHEN** a Web Push send remains unresolved
- **THEN** event-forwarding latency to connected browsers SHALL remain at its existing baseline
- **AND** the event pipeline SHALL return without waiting for delivery

#### Scenario: Transport throws synchronously
- **WHEN** a configured transport send throws synchronously
- **THEN** `fanout` SHALL NOT propagate the throw
- **AND** the failure SHALL be logged with the offending token id

#### Scenario: Non-awaited call-site contract
- **WHEN** the source is checked for the event-wiring push call
- **THEN** no awaited `pushDispatcher.fanout` call SHALL be present

### Requirement: Per-(session, device) coalescing

The dispatcher SHALL coalesce at most one delivery attempt per `(sessionId, deviceToken)` during `coalesceWindowMs` (default `30_000` ms, existing range `5_000`–`300_000` ms). Different devices for one session and different sessions for one device SHALL remain independent.

#### Scenario: Five rapid triggers within 10 s
- **WHEN** five trigger events fire for one session within 10 s with one Web Push device registered
- **THEN** that device SHALL receive at most one push during the window

#### Scenario: Two devices, one trigger
- **WHEN** one trigger fires for a session with two Web Push devices registered
- **THEN** each device SHALL receive one push attempt

#### Scenario: Two sessions, one device
- **WHEN** trigger events fire for session A and session B within the window with one device registered
- **THEN** the device SHALL receive one push attempt for each session

#### Scenario: After the window closes
- **WHEN** a trigger fires at t=0 and another after the configured window
- **THEN** the device SHALL receive two push attempts

### Requirement: Secure token and VAPID persistence

The server SHALL persist registered tokens to `~/.pi/dashboard/push-tokens.json` and VAPID keys to `~/.pi/dashboard/push-vapid.json` through atomic tmp+rename writes with owner-only mode `0600`. Tokens SHALL carry `{id, deviceToken, transport, userId?, sessionFilter?, registeredAt, lastUsedAt}`. Private VAPID material and complete subscription endpoints MUST NOT be logged.

#### Scenario: Server restart preserves Web Push registration
- **WHEN** a Web Push token is registered and the server restarts
- **THEN** the token and VAPID keypair SHALL remain available from their persistence files

#### Scenario: Idempotent registration
- **WHEN** the same Web Push `deviceToken` is registered twice
- **THEN** the registry SHALL contain one entry for that device token
- **AND** `lastUsedAt` SHALL reflect the more recent registration

#### Scenario: Dead Web Push subscription pruning
- **WHEN** Web Push returns `{ok: false, gone: true}` for a token
- **THEN** the token SHALL be removed during that dispatch
- **AND** the persistence file SHALL be updated atomically

### Requirement: Web Push transport with deferred typed extension point

The shippable transport SHALL be Web Push authenticated with VAPID and SHALL implement the shared `PushTransport` interface. The interface MAY retain `kind: "web-push" | "fcm"`; `"fcm"` is a typed, explicitly deferred extension point only. Phase 1 SHALL NOT claim FCM JWT signing, HTTP delivery, service-account setup, or FCM pruning.

#### Scenario: Web Push transport sends a notification
- **WHEN** a registered token with `transport: "web-push"` is dispatched
- **THEN** the Web Push adapter SHALL receive the token and compact session-link payload
- **AND** a successful push-service response SHALL be reported as `{ok: true}`

#### Scenario: FCM extension remains deferred
- **WHEN** a token has `transport: "fcm"`
- **THEN** the union and registry shape SHALL remain type-compatible for a future adapter
- **AND** FCM delivery SHALL NOT be required for Phase 1 acceptance or merge

#### Scenario: Unknown transport
- **WHEN** a token has an unrecognized transport value
- **THEN** it SHALL be skipped with a warning without crashing dispatch

### Requirement: VAPID key lifecycle

The server SHALL generate a VAPID keypair on first enabled use and persist it at `~/.pi/dashboard/push-vapid.json`. The keypair SHALL be reused across restarts, and the public key SHALL be exposed by the existing auth-gated `GET /api/push/vapid-public-key` endpoint.

#### Scenario: Keypair generated once
- **WHEN** the enabled Web Push path starts without a VAPID file
- **THEN** the file SHALL be created with `{publicKey, privateKey}` using owner-only persistence

#### Scenario: Keypair reused
- **WHEN** the server restarts with the VAPID file present
- **THEN** the existing keypair SHALL be loaded without replacement

#### Scenario: Public key endpoint
- **WHEN** an authenticated client GETs `/api/push/vapid-public-key`
- **THEN** the response SHALL be `200 {publicKey: <base64url>}`

### Requirement: Push REST API

When push is enabled, the server SHALL expose these existing auth-gated endpoints:

- `POST /api/push/register` — body `{deviceToken, transport, sessionFilter?}` → `200 {tokenId}`.
- `DELETE /api/push/register/:tokenId` → `204`.
- `POST /api/push/test` — body `{tokenId?}` → `200 {results: [{tokenId, ok, gone?}]}`.
- `GET /api/push/vapid-public-key` → `200 {publicKey}`.

All endpoints SHALL use the existing auth/network guard chain. The Web Push path is the only delivery path in scope; FCM registration compatibility does not make FCM delivery a requirement.

#### Scenario: Unauthenticated register is rejected
- **WHEN** a non-loopback, non-trusted request reaches `POST /api/push/register` without valid auth
- **THEN** the shared network guard SHALL reject it

#### Scenario: Test endpoint with no tokens
- **WHEN** the caller has no registered tokens and posts to `/api/push/test`
- **THEN** the response SHALL be `200 {results: []}`

### Requirement: Opt-in by default

The `push` config block SHALL default to `{enabled: false}`. When `push.enabled !== true`, the server SHALL not construct the dispatcher, mount push routes, or generate VAPID keys. Existing unread and WebSocket behavior SHALL remain unchanged. A client requesting disabled push routes SHALL receive `404`.

#### Scenario: Default config has push disabled
- **WHEN** a fresh config has no `push` block
- **THEN** `config.push.enabled` SHALL be `false`
- **AND** no push side effects SHALL occur on event flow

#### Scenario: Disabled server returns 404
- **WHEN** push is disabled and a client requests `/api/push/vapid-public-key`
- **THEN** the response SHALL be `404`

### Requirement: Existing PWA subscription and service-worker surface

The existing PWA subscription hook SHALL feature-detect Web Push, retrieve the VAPID public key, recover and re-register an existing subscription idempotently, and expose subscribe/unsubscribe/test operations. The service worker SHALL display push notifications and navigate notification clicks to the payload URL. New permission approval/deny UX is deferred and is not a Phase 1 gate.

#### Scenario: Existing subscription is recovered
- **WHEN** a supported PWA loads with an existing browser subscription
- **THEN** the hook SHALL reflect subscribed state and re-register the subscription without duplicating its token record

#### Scenario: Push event with valid JSON
- **WHEN** the service worker receives `{title, body, url, sessionId}`
- **THEN** a system notification SHALL be displayed with that title and body

#### Scenario: Notification click
- **WHEN** the user taps the displayed notification
- **THEN** the service worker SHALL open or focus a window at the payload URL

### Requirement: Explicitly deferred native and permission capabilities

Capacitor/APNs/native notifications, native permission approval flows, new PWA permission approval/deny UX, Phase 2 ask/elicitation UX, and Phase 3 toggles SHALL remain out of scope. OpenSpec 12.x browser and phone checks SHALL remain advisory checklists rather than Phase 1 merge gates. FCM manual scenarios SHALL remain deferred follow-on work.
***
