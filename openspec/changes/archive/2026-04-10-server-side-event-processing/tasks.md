## 1. Move shared utilities

- [x] 1.1 Move `src/extension/openspec-activity-detector.ts` to `src/shared/openspec-activity-detector.ts` and update all import paths (bridge.ts, any tests)
- [x] 1.2 Move `src/extension/stats-extractor.ts` to `src/shared/stats-extractor.ts` and update all import paths (bridge.ts, any tests)

## 2. Add server-side event processing

- [x] 2.1 In `src/server/event-wiring.ts`, inside the `event_forward` handler, add OpenSpec detection: on `tool_execution_start` call `detectOpenSpecActivity()`, update session, broadcast; on `agent_end` clear OpenSpec fields. Replicate the auto-attach logic from the current `openspec_activity_update` handler.
- [x] 2.2 In `src/server/event-wiring.ts`, inside the `event_forward` handler, add stats extraction: on `turn_end` call `extractTurnStats()`, accumulate into session, synthesize `stats_update` event, store + broadcast.

## 3. Remove bridge-side processing

- [x] 3.1 In `src/extension/bridge.ts`, remove OpenSpec detection from `tool_execution_start` handler (remove `detectOpenSpecActivity` call, `currentOpenSpecPhase`/`currentOpenSpecChange` state, `sendOpenSpecActivityUpdate` function, and `agent_end` clearing logic)
- [x] 3.2 In `src/extension/bridge.ts`, add `contextUsage` enrichment to `turn_end` event before forwarding: attach `ctx.getContextUsage()` to the event data
- [x] 3.3 In `src/extension/bridge.ts`, remove the dedicated `turn_end` handler's `extractTurnStats()` call and `stats_update` message send (keep the `firstMessage` extraction logic)
- [x] 3.4 In `src/extension/bridge.ts`, remove `sendModelUpdateIfChanged()` call from the `model_select` handler

## 4. Remove protocol messages and server handlers

- [x] 4.1 Remove the `openspec_activity_update` handler block from `src/server/event-wiring.ts`
- [x] 4.2 Remove the `stats_update` handler blocks from `src/server/pi-gateway.ts` and `src/server/event-wiring.ts`
- [x] 4.3 Remove `OpenSpecActivityUpdateMessage` and `StatsUpdateMessage` from the `ExtensionToServerMessage` union in `src/shared/protocol.ts`

## 5. Verify

- [x] 5.1 Run `npm run reload:check` to type-check
- [x] 5.2 Run `npm test` to verify no test regressions
- [x] 5.3 Reload sessions and verify OpenSpec detection and stats still work in the dashboard
