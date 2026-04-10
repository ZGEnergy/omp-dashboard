## Why

The bridge extension currently processes several event types with custom logic — extracting stats, detecting OpenSpec activity, enriching model events — then sends derived protocol messages to the server. Now that the catch-all-event-forwarding change delivers all raw events to the server, this processing can move server-side. This makes the bridge a dumber transport pipe, centralizes business logic on the server (easier to maintain/debug), and eliminates dedicated protocol message types that are redundant with the raw event data.

## What Changes

### 1. OpenSpec activity detection → server-side
- **Remove** from bridge: `detectOpenSpecActivity()` calls in `tool_execution_start` handler, OpenSpec state tracking (`currentOpenSpecPhase`, `currentOpenSpecChange`), `agent_end` clearing logic, and `sendOpenSpecActivityUpdate()`.
- **Add** to server: in `event-wiring.ts`, when receiving `tool_execution_start` events via `event_forward`, call `detectOpenSpecActivity()` and update session directly via `sessionManager.update()`. On `agent_end`, clear OpenSpec fields.
- **Move** `openspec-activity-detector.ts` from `src/extension/` to `src/shared/` (used by both server and potentially bridge in the future).
- **Remove** the `openspec_activity_update` protocol message type — server updates session state directly, no bridge→server message needed.

### 2. Stats extraction from turn_end → server-side
- **Remove** from bridge: `extractTurnStats()` call in the dedicated `turn_end` handler, and the `stats_update` protocol message send.
- **Add** to server: in `event-wiring.ts`, when receiving `turn_end` events, extract stats using the existing `extractTurnStats()` function and update session + broadcast to browsers.
- **Move** `stats-extractor.ts` from `src/extension/` to `src/shared/` so the server can import it.
- **Keep** the bridge's `turn_end` handler for `firstMessage` extraction (requires `ctx.sessionManager` — pi-internal, cannot move).
- **Note on contextUsage**: The bridge currently calls `ctx.getContextUsage()` which is a pi API. To move stats fully server-side, the bridge must include `contextUsage` in the forwarded `turn_end` event data. Add a small enrichment: before forwarding `turn_end`, attach `contextUsage` from `ctx.getContextUsage()` to the event.

### 3. model_select thinkingLevel enrichment stays on bridge (partial)
- The bridge already enriches `model_select` events with `thinkingLevel` from `pi.getThinkingLevel()` — this pi API call cannot move server-side.
- **Remove** the separate `model_update` protocol message send from the bridge's `model_select` handler. The server already extracts model/thinkingLevel from the enriched `model_select` event in `extractSessionUpdates()`.
- **Simplify**: The bridge enriches and forwards the event; the server's existing `extractSessionUpdates()` handles the rest.

### Not moved (requires pi-internal APIs)
These bridge functions require pi process APIs and cannot move server-side:
- `firstMessage` extraction (`ctx.sessionManager`) 
- Git info polling (`git` CLI in session cwd)
- Session name detection (`pi.getSessionName()`)
- Model list updates (`cachedModelRegistry.getAvailable()`)
- Heartbeat/process metrics (`process.cpuUsage()`)
- Flow list queries (`pi.events.emit("flow:list-flows")`)

## Capabilities

### New Capabilities
- `server-side-event-processing`: Server extracts OpenSpec activity and token stats directly from forwarded events, eliminating bridge-side processing and dedicated protocol messages.

### Modified Capabilities
- `bridge-extension`: Remove OpenSpec detection logic, stats extraction, and `model_update` send. Bridge becomes thinner.
- `shared-protocol`: Remove `openspec_activity_update` and `stats_update` message types (server processes raw events directly).

## Impact

- **`src/extension/bridge.ts`**: Remove ~40 lines (OpenSpec detection, stats extraction, model_update send). Add ~3 lines (contextUsage enrichment on turn_end forwarding).
- **`src/extension/openspec-activity-detector.ts`** → move to `src/shared/openspec-activity-detector.ts`
- **`src/extension/stats-extractor.ts`** → move to `src/shared/stats-extractor.ts`
- **`src/server/event-wiring.ts`**: Add OpenSpec detection on `tool_execution_start`/`agent_end` events, add stats extraction on `turn_end` events (~30 lines).
- **`src/shared/protocol.ts`**: Remove `openspec_activity_update` and `stats_update` message types from `ExtensionToServerMessage`.
- **`src/server/event-wiring.ts`**: Remove handler for `openspec_activity_update` messages (replaced by inline event processing).
- **No client changes** — browsers already receive session updates and stats via `session_updated` broadcasts.
- **No breaking changes** — protocol message removal is internal (bridge→server only).
