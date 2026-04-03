## Why

Pi agent sessions intermittently get marked as "ended" in the dashboard during heavy workloads (e.g., running `npm test`). The root cause is that the bridge↔server WebSocket connection can silently die (TCP half-open state), and neither side detects it until the 45-second application-level heartbeat timeout fires. There is no WS-level ping/pong, no client-side watchdog, and no logging when sessions are unregistered — making the issue hard to diagnose and impossible to recover from quickly.

## What Changes

- Add WebSocket-level ping/pong to the pi-gateway so dead connections are detected within seconds, not minutes
- Add a client-side heartbeat watchdog in the bridge so it proactively reconnects when the server stops responding
- Add diagnostic logging when sessions are unregistered (heartbeat timeout vs explicit vs sleep detection) so the root cause is visible
- Increase resilience of the heartbeat system by making the server-side timeout aware of connection health state

## Capabilities

### New Capabilities
- `ws-ping-pong`: WebSocket-level ping/pong on the pi-gateway for fast dead-connection detection
- `bridge-heartbeat-watchdog`: Client-side watchdog that detects server unresponsiveness and forces reconnection
- `session-lifecycle-logging`: Diagnostic logging for session registration, unregistration, and heartbeat events

### Modified Capabilities
- `bridge-extension`: Bridge sends heartbeat acknowledgments and monitors server liveness
- `shared-protocol`: New heartbeat_ack message type for bidirectional health checking

## Impact

- **Server** (`src/server/pi-gateway.ts`): Add WS ping interval, log session lifecycle events
- **Bridge** (`src/extension/bridge.ts`, `src/extension/connection.ts`): Add watchdog timer, handle pong, force reconnect on server silence
- **Protocol** (`src/shared/protocol.ts`): Add heartbeat_ack message type
- **No breaking changes**: Existing heartbeat mechanism continues to work; new mechanisms layer on top
