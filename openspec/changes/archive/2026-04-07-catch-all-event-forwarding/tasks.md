## 1. Export rename maps from flow-event-wiring

- [x] 1.1 Export `FLOW_EVENT_MAP` and `SUBAGENT_EVENT_MAP` from `src/extension/flow-event-wiring.ts`
- [x] 1.2 Remove the two `event_forward` sending loops (for FLOW_EVENT_MAP and SUBAGENT_EVENT_MAP channels) from `registerFlowEventListeners`, keeping the `flow:rediscover` and `flow:complete` listeners intact

## 2. Add EventBus emit intercept in bridge

- [x] 2.1 In `src/extension/bridge.ts`, import `FLOW_EVENT_MAP` and `SUBAGENT_EVENT_MAP` from `flow-event-wiring.ts` and merge them into a single `EVENT_BUS_MAP` constant
- [x] 2.2 After `pi.events` availability check, wrap `pi.events.emit` to intercept all emissions: look up `eventType` from `EVENT_BUS_MAP` (fallback to channel name), forward as `event_forward` if `sessionReady`, always call original emit
- [x] 2.3 In the extension cleanup function, restore `pi.events.emit` to the original function

## 3. Expand core event subscriptions

- [x] 3.1 Add all remaining pi core event types to the subscription in `bridge.ts`: `tool_call`, `tool_result`, `user_bash`, `input`, `before_agent_start`, `resources_discover`, `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_before_tree`, `session_tree` — using the existing generic forward handler (no special enrichment)
- [x] 3.2 Verify excluded events are NOT in any subscription list: `context`, `before_provider_request` (payload too large), `session_start`, `session_switch`, `session_fork`, `session_shutdown` (have dedicated handlers that produce their own protocol messages)

## 4. Test and verify

- [x] 4.1 Run `npm run reload:check` to type-check and reload all pi sessions
- [x] 4.2 Verify in the dashboard that previously-invisible events (e.g., `tool_call`, custom extension events) now appear as collapsed `RawEventCard` JSON cards
