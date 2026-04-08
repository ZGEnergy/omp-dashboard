## 1. Server: Add getMaxSeq to event store

- [x] 1.1 Add `getMaxSeq(sessionId): number` method to `EventStore` interface and `createMemoryEventStore` implementation — returns the highest seq for a session, or 0 if empty
- [x] 1.2 Add tests for `getMaxSeq` in `memory-event-store.test.ts`

## 2. Server: Stale lastSeq detection in subscription handler

- [x] 2.1 In `handleSubscribe`, after resolving events, check if `msg.lastSeq > maxSeq` — if so, send `session_state_reset` to the subscribing WebSocket and replay from seq 1
- [x] 2.2 Add tests for stale lastSeq detection (lastSeq > server max → reset + full replay; lastSeq within range → delta only)

## 3. Server: Skip event wipe on bridge reconnect

- [x] 3.1 Add optional `eventCount?: number` field to `session_register` in `protocol.ts`
- [x] 3.2 In `event-wiring.ts` `session_register` handler, compare `msg.eventCount` with `session.lastEntryCount` (stored from previous registration) — skip `deleteEventsForSession` and `broadcastSessionStateReset` when counts match and events exist in store
- [x] 3.3 Add tests for skip-wipe logic: matching eventCount → no wipe; mismatching → wipe; missing eventCount → wipe (backward compat); different sessionId → wipe

## 4. Bridge: Send eventCount with session_register

- [x] 4.1 In `session-sync.ts` `sendStateSync`, read `entries.length` from `ctx.sessionManager.getBranch()` and include as `eventCount` in the `session_register` message
- [x] 4.2 In `session-sync.ts` `handleSessionChange`, include `eventCount` in the new `session_register` (session switch/fork always has different sessionId, so wipe will happen regardless, but include for consistency)

## 5. Server: Suppress live events during delta replay

- [x] 5.1 In `browser-gateway.ts`, add a per-WebSocket `replayingSessionIds: Set<string>` that tracks which sessions are mid-replay for that socket
- [x] 5.2 In `broadcastEvent`, skip sending to WebSockets that have the session in their `replayingSessionIds` set
- [x] 5.3 In `subscription-handler.ts`, add session to `replayingSessionIds` before starting replay; remove after `isLast: true` batch is sent
- [x] 5.4 After replay completes, send a catch-up batch of any events with seq > last replayed seq to the WebSocket
- [x] 5.5 Add tests: live event during replay is suppressed; events are delivered after replay; other sockets not affected

## 6. Client: Track maxSeq per session

- [x] 6.1 Add `maxSeqMap` state (`Map<string, number>`) in `App.tsx` alongside `sessionStates`
- [x] 6.2 In `useMessageHandler`, update `maxSeqMap` on `event` message (`msg.seq`) and `event_replay` batches (last event's seq)
- [x] 6.3 In `useMessageHandler`, reset `maxSeqMap` entry to 0 on `session_state_reset`
- [x] 6.4 Pass `maxSeqMap` to subscribe callsites — send `lastSeq: maxSeqMap.get(sessionId) ?? 0` instead of hardcoded `0`

## 7. Client: Lazy subscription

- [x] 7.1 Remove auto-subscribe from `session_added` handler in `useMessageHandler.ts` — stop sending `subscribe` for every new active session
- [x] 7.2 Keep the existing lazy-subscribe in the `selectedId` effect (`App.tsx` line ~184) — this already subscribes on session select
- [x] 7.3 Verify sidebar session cards still display correctly using only `session_added`/`session_updated` metadata (no events needed) — confirmed: all sidebar data comes from DashboardSession, contextUsageMap falls back to session metadata
- [x] 7.4 Verified by code inspection: that browser connect with 10 active sessions sends 0 subscribe messages (only subscribes when user selects one)
