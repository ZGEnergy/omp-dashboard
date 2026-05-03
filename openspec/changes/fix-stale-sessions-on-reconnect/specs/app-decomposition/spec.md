## ADDED Requirements

### Requirement: Reconnect handler defers session-registry reset to snapshot

The reconnect effect in `App.tsx` (the one keyed on transitioning to `status === "connected"`) SHALL NOT pre-reset `sessionOrderMap`. The incoming `sessions_snapshot` message SHALL be the sole authority for replacing both `sessions` and `sessionOrderMap` after reconnect.

The same effect SHALL continue to clear `subscribedRef` and `terminals` because those are not covered by the snapshot.

#### Scenario: Reconnect does not flash empty sidebar
- **WHEN** the WebSocket transitions from non-connected to `connected`
- **THEN** `App.tsx` SHALL NOT call `setSessionOrderMap(new Map())`
- **AND** `App.tsx` SHALL still call `subscribedRef.current.clear()` and `setTerminals(new Map())`

#### Scenario: Snapshot drives the post-reconnect state
- **WHEN** the post-reconnect `sessions_snapshot` arrives
- **THEN** `useMessageHandler` SHALL replace both `sessions` and `sessionOrderMap` with the snapshot payload (see session-listing spec)
