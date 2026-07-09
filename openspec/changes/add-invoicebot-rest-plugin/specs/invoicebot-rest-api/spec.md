## ADDED Requirements

### Requirement: Plugin is a monorepo package behind an engine port, with an interim file link marked release-blocking
The InvoiceBot REST plugin SHALL be a `packages/*` workspace package that accesses invoice logic through an `InvoiceEngine` port interface, not by importing engine internals. Because `@blackbelt-technology/invoicebot` is unpublished, the plugin SHALL declare it via an interim `file:../pi-invoice-bot` dependency carrying an explicit release-blocking marker (`TODO(release): …`). A `FakeInvoiceEngine` SHALL back environments where that sibling is absent (CI / `release-cut`). The `file:` link SHALL be replaced by a published npm range or a vendored in-monorepo package before release.

#### Scenario: Local dev binds the real engine over the file link
- **WHEN** the monorepo is installed with the sibling repo present at `../pi-invoice-bot`
- **THEN** the plugin SHALL bind `RealInvoiceEngine` using the engine facade imported over the `file:` link

#### Scenario: CI / release without the sibling binds the fake
- **WHEN** the plugin is built where `../pi-invoice-bot` is not checked out (CI, `release-cut`)
- **THEN** the plugin SHALL bind `FakeInvoiceEngine` and its routes SHALL still respond
- **AND** the build SHALL NOT ship the `file:` link in a published artifact

#### Scenario: Interim dependency is marked for removal
- **WHEN** the plugin `package.json` declares the `file:../pi-invoice-bot` dependency
- **THEN** it SHALL carry a `TODO(release)` marker naming the exit (publish or vendor)

#### Scenario: Routes depend only on the port
- **WHEN** the engine binding is later swapped (fake↔real, or file-link→published/vendored)
- **THEN** the route handlers SHALL require no change (the swap is isolated to the adapter implementing `InvoiceEngine`)

### Requirement: REST plane wraps the four ib_* selectors, keyed by cwd
The dashboard SHALL expose four POST endpoints under `/api/plugins/invoicebot/*` — `query`, `review`, `setup`, `rules` — each wrapping one `ib_*` selector (`view` for query; `action` for review/setup/rules). Every request SHALL carry a `cwd` field identifying the target workspace. The plugin SHALL forward `{ selector, ...args }` to the matching `InvoiceEngine` method and return its result, without re-implementing invoice logic.

#### Scenario: Read forwards to the engine for the given cwd
- **WHEN** the client POSTs `/api/plugins/invoicebot/query` with `{ cwd, view: "pending" }`
- **THEN** the plugin SHALL call `engine.query(cwd, { view: "pending" })` and return its result
- **AND** a request with a different `cwd` SHALL target that other workspace, from the same server process

#### Scenario: Missing cwd is rejected
- **WHEN** any endpoint is called without a `cwd` field
- **THEN** the plugin SHALL respond `400` with an error and perform no engine call

#### Scenario: Selector is required
- **WHEN** `/query` is called without `view` (or `review/setup/rules` without `action`)
- **THEN** the plugin SHALL respond `400` and perform no mutation

### Requirement: cwd is the sole workspace key passed to the engine
The plugin SHALL treat `cwd` as the per-request workspace key and pass it to every engine call. It SHALL NOT rely on an ambient/process-wide working directory to select a workspace. How the engine physically resolves `cwd` to a state directory is an engine-implementation concern behind the port.

#### Scenario: Concurrent requests for two workspaces stay isolated at the port
- **GIVEN** two requests, one with `cwd=A` and one with `cwd=B`, handled concurrently
- **THEN** the plugin SHALL call the engine with `A` and `B` respectively
- **AND** SHALL NOT leak one request's `cwd` into the other's engine call

### Requirement: Pure ops via the port; flow-triggering ops dispatch a flow into the workspace session
Read and non-flow write ops SHALL be served through the `InvoiceEngine` port. The five flow-triggering ops — `approve`, `repair`, `submit`, `partner-confirm`, `rules-request` — SHALL perform their port-side DB effect AND dispatch the corresponding `flow:run` into the target workspace's pi session (reusing the existing flows dispatch seam), rather than emitting onto an absent in-process session bus. Flow dispatch SHALL be independent of the engine binding.

#### Scenario: Approve records the decision and advances the invoice
- **WHEN** the client POSTs `/review` with `{ cwd, action: "approve", invoice_id }`
- **THEN** the approval SHALL be recorded via the engine for workspace `cwd`
- **AND** a `flow:run` for `invoicebot:process` SHALL be dispatched into that workspace's session

#### Scenario: Rule request stages via the add-rule flow
- **WHEN** the client POSTs `/rules` with `{ cwd, action: "request", id, seq, description }`
- **THEN** the plugin SHALL dispatch `invoicebot:add-rule` into the workspace session
- **AND** SHALL NOT alter the live ruleset until a subsequent `action: "approve"`

#### Scenario: Pure write needs no flow
- **WHEN** the client POSTs `/review` with `{ cwd, action: "note", ... }`
- **THEN** the note SHALL be written via the engine and no `flow:run` SHALL be dispatched

#### Scenario: Reuse a supplied live session instead of spawning
- **WHEN** a flow-triggering op is called with a `sessionId` that is live, in the request `cwd`, and an invoicebot session
- **THEN** the plugin SHALL emit `flow:run` into that session via `ctx.emitEventToSession(sessionId, { eventType: "flow:run", data })` and SHALL NOT spawn a new session
- **AND** SHALL return that same `sessionId`

#### Scenario: Spawn and correlate by runId when no live session is reusable
- **WHEN** no valid live `sessionId` is supplied or linked (or the supplied one fails validation / is dead)
- **THEN** the plugin SHALL spawn the run session via `ctx.spawnSession({ cwd, automationRun: { runId } })`
- **AND** SHALL bind the resulting `sessionId` by matching the registering session's stamped `automationRun.runId`, NOT by cwd

#### Scenario: Reuse never targets an unrelated session
- **WHEN** a supplied `sessionId` does not match the request `cwd` or is not an invoicebot session
- **THEN** the plugin SHALL NOT emit into it, and SHALL fall through to the spawn branch

### Requirement: REST is request/response only — no engine event streaming
The REST plane SHALL NOT push engine `ib:*` events to clients. Mutations SHALL return their result synchronously; clients refetch to observe derived state. Live event streaming remains the WebSocket conversation plane's responsibility, out of scope for this capability.

#### Scenario: Mutation returns result, no event stream
- **WHEN** a consequential op (e.g. `handoff` delivery) completes
- **THEN** the endpoint SHALL return the operation result in the HTTP response
- **AND** SHALL NOT open an event stream or require the client to subscribe over REST

### Requirement: Flow-triggering ops surface and link a sessionId
Each flow-triggering op SHALL surface the `sessionId` of the pi session running its flow and SHALL record an `invoice_id ↔ sessionId` link. `resolveSessionId(invoiceId)` SHALL return the linked `sessionId`, falling back to a `sessionManager` scan of sessions in the workspace running `invoicebot:process` when no REST-op link exists (e.g. intake-spawned sessions). The WebSocket conversation streaming that consumes the `sessionId` remains out of scope.

#### Scenario: Op returns and links the sessionId
- **WHEN** a flow-triggering op completes its spawn
- **THEN** the response SHALL carry the run's `sessionId` (or a `runId`/`spawnToken` the client can resolve to it)
- **AND** `resolveSessionId(invoice_id)` SHALL thereafter return that `sessionId`

#### Scenario: Fallback for intake-created sessions
- **WHEN** an invoice has no REST-op-recorded session link
- **THEN** `resolveSessionId` SHALL attempt to resolve it by scanning workspace sessions running `invoicebot:process`
- **AND** SHALL return `null` (without throwing) when none matches
