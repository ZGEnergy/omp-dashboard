## Why

Every browser reconnect, session subscribe, and bridge reconnect triggers a full replay of ALL events from sequence 1. The protocol already supports incremental sync (`lastSeq` on subscribe, monotonic seq numbers, range queries in the event store), but the client always sends `lastSeq: 0` and the server always wipes events on bridge reconnect. This wastes bandwidth, CPU (re-reducing hundreds of events through the reducer), and creates visible latency on reconnect — especially for long-running sessions with thousands of events.

## What Changes

- **Client tracks highest received seq per session** and sends it on re-subscribe, so the server only returns the delta
- **Bridge reconnect skips server event wipe** when the session hasn't changed (no switch/fork/compact), avoiding full replay cascade to all browsers
- **Client uses lazy subscription** — only subscribes to the currently selected session instead of all active sessions on connect; sidebar cards already receive metadata via `session_updated` broadcasts

## Capabilities

### New Capabilities
- `incremental-event-sync`: Client-side seq tracking, delta-only subscribe, and smart bridge reconnect that preserves server event state when possible

### Modified Capabilities
- `in-memory-event-buffer`: Server skip-wipe logic on bridge reconnect when events are unchanged (new generation/hash check)
- `on-demand-session-replay`: Subscribe with non-zero `lastSeq` for delta replay instead of full replay
- `browser-gateway-decomposition`: Lazy subscription — subscribe only to selected session, not all active sessions on connect

## Impact

- **Client** (`src/client/`): `useMessageHandler.ts`, `App.tsx` — track `maxSeq` per session, send it on subscribe, change auto-subscribe to lazy
- **Server** (`src/server/`): `event-wiring.ts` — conditional wipe on bridge reconnect; `subscription-handler.ts` — already supports `lastSeq` filtering (no change needed)
- **Bridge** (`src/extension/`): `session-sync.ts` — send event count or generation marker with `session_register` so server can decide whether to wipe
- **Protocol** (`src/shared/`): `protocol.ts` — add optional `eventGeneration` field to `session_register`; `browser-protocol.ts` — no changes (lastSeq already exists)
- **Backward compatible**: Clients that send `lastSeq: 0` still get full replay. Bridges without `eventGeneration` trigger the existing full-wipe behavior.
