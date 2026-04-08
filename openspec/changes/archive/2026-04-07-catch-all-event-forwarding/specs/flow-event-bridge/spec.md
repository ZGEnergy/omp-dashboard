## MODIFIED Requirements

### Requirement: Remove forwarding loops from flow-event-wiring
The `registerFlowEventListeners` function SHALL remove the `event_forward` sending loops for `FLOW_EVENT_MAP` and `SUBAGENT_EVENT_MAP` channels. Event forwarding for these channels is now handled by the EventBus emit intercept in `bridge.ts`.

The function SHALL retain its non-forwarding responsibilities:
- Listening to `flow:rediscover` and `flow:complete` to resend `commands_list` and `flows_list` messages

#### Scenario: No duplicate forwarding
- **WHEN** a `flow:flow-started` event is emitted on `pi.events`
- **THEN** only the EventBus intercept SHALL forward it (not the flow-event-wiring listener)

#### Scenario: Commands and flows refresh preserved
- **WHEN** `flow:rediscover` or `flow:complete` fires
- **THEN** `registerFlowEventListeners` SHALL still resend `commands_list` and `flows_list`

### Requirement: Event rename maps exported for intercept
The `FLOW_EVENT_MAP` and `SUBAGENT_EVENT_MAP` constants SHALL be exported from `flow-event-wiring.ts` so that `bridge.ts` can merge them into the unified `EVENT_BUS_MAP` used by the emit intercept.

#### Scenario: Maps importable
- **WHEN** `bridge.ts` imports from `flow-event-wiring.ts`
- **THEN** `FLOW_EVENT_MAP` and `SUBAGENT_EVENT_MAP` SHALL be available as named exports
