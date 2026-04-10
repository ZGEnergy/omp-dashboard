## Context

With the catch-all-event-forwarding change, the server now receives ALL pi core events as raw `event_forward` messages. Three pieces of bridge-side processing can move server-side because the raw event data contains everything needed:

1. **OpenSpec activity detection** — inspects `tool_execution_start` args (pure function, no pi API needed)
2. **Stats extraction from turn_end** — reads `event.message.usage` (pure function, but `contextUsage` needs bridge enrichment)
3. **model_update send after model_select** — redundant, server already extracts model from the enriched event via `extractSessionUpdates()`

Current data flow for these:
```
bridge → [process event] → [dedicated protocol message] → server → [handle message] → sessionManager + browser
```

Target data flow:
```
bridge → [event_forward (raw)] → server → [process in event_forward handler] → sessionManager + browser
```

## Goals / Non-Goals

**Goals:**
- Move OpenSpec detection and stats extraction to server-side event processing
- Eliminate `openspec_activity_update` and `stats_update` protocol message types
- Remove `model_update` send from bridge (server already handles via `extractSessionUpdates`)
- Move shared utilities (`openspec-activity-detector.ts`, `stats-extractor.ts`) to `src/shared/`

**Non-Goals:**
- Moving logic that requires pi process APIs (git polling, session name, model list, firstMessage, heartbeat)
- Changing the client-side event reducer or browser protocol
- Removing `model_update` protocol type entirely (still used for session-level tracking from bridge reconnect/state sync)

## Decisions

### 1. Process OpenSpec activity inline in event_forward handler

**Decision**: In `event-wiring.ts`, within the existing `event_forward` handler, check for `tool_execution_start` and `agent_end` events and run OpenSpec detection logic directly. Update `sessionManager` and broadcast `session_updated` inline — no separate protocol message needed.

**Rationale**: The server already has an `event_forward` processing block that calls `extractSessionUpdates()`. OpenSpec detection is the same pattern — derive session state from event data.

**Implementation site**: Inside `piGateway.onEvent` handler, after the existing `extractSessionUpdates()` block.

### 2. Process stats inline in event_forward handler

**Decision**: In `event-wiring.ts`, within the `event_forward` handler, detect `turn_end` events and call `extractTurnStats()` to derive stats. Accumulate into session and broadcast to browsers. Also synthesize a `stats_update` DashboardEvent and store in the event store (so browser replays still work).

**Rationale**: The stats pipeline currently has two touchpoints (pi-gateway accumulates, event-wiring broadcasts). Consolidating into event_forward processing eliminates both the pi-gateway `stats_update` handler and the event-wiring `stats_update` handler.

**Bridge enrichment needed**: The bridge must attach `contextUsage` from `ctx.getContextUsage()` to the `turn_end` event data before forwarding, because this API is bridge-only. This is a ~3 line addition in the `turn_end` enrichment.

### 3. Keep model_update protocol type but remove redundant bridge send

**Decision**: Remove the `sendModelUpdateIfChanged()` call from the bridge's `model_select` handler. The server's `extractSessionUpdates()` already extracts `model` and `thinkingLevel` from the enriched `model_select` event and updates the session.

**Keep** the `model_update` message type in the protocol — it's still sent during bridge reconnect state sync (`sendStateSync`) to restore model info for sessions where events may have been evicted.

### 4. Move utility files to src/shared/

**Decision**: Move `openspec-activity-detector.ts` and `stats-extractor.ts` to `src/shared/`. Update all import paths. These are pure functions with no pi SDK dependencies.

### 5. Remove protocol messages and their handlers

**Decision**: 
- Remove `openspec_activity_update` handler from `event-wiring.ts` (lines 318-345) and `StatsUpdateMessage` handler from both `pi-gateway.ts` (lines 287-304) and `event-wiring.ts` (lines 425-456).
- Remove `OpenSpecActivityUpdateMessage` and `StatsUpdateMessage` from `protocol.ts` `ExtensionToServerMessage` union.
- Keep the type definitions temporarily for backwards compatibility (old bridges connecting to new server) but the server handler just ignores them.

## Risks / Trade-offs

- **[Backwards compatibility]** An old bridge (pre-change) would still send `stats_update` and `openspec_activity_update`. → Mitigated: keep the handlers as no-ops initially, or remove entirely since bridge and server are always deployed together.
- **[Duplicate stats events]** The `turn_end` event is forwarded AND we synthesize a `stats_update` event from it. → The `stats_update` is a separate synthetic event inserted into the event store for client replay compatibility. No duplicate broadcast — the session_updated broadcast replaces the old pattern.
- **[contextUsage enrichment]** The bridge must add `contextUsage` to turn_end events. If forgotten, context stats are lost. → Mitigated: explicit in the turn_end handler, hard to miss.
