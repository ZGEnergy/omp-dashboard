## 1. Protocol

- [x] 1.1 Add `HeartbeatAckMessage` type to `src/shared/protocol.ts` and include it in the `ServerToExtensionMessage` union

## 2. Server-side WS ping/pong

- [x] 2.1 Add WS-level ping interval (30s) to pi-gateway with `isAlive` flag pattern — ping all connections, terminate those that didn't pong since last cycle
- [x] 2.2 Clear the ping interval in `piGateway.stop()`
- [x] 2.3 Write tests for ping/pong dead connection detection (mock ws ping/pong, verify terminate is called on timeout)

## 3. Server-side heartbeat_ack

- [x] 3.1 Send `{ type: "heartbeat_ack" }` on the WebSocket when the server receives a `session_heartbeat` message
- [x] 3.2 Write test verifying heartbeat_ack is sent in response to session_heartbeat

## 4. Session lifecycle logging

- [x] 4.1 Add `console.error` log lines in pi-gateway for: session registered, session unregistered (explicit), heartbeat timeout, sleep timeout, ping timeout, connection closed
- [x] 4.2 Write tests verifying log output for each lifecycle event

## 5. Bridge-side watchdog

- [x] 5.1 Add `lastMessageAt` tracking to `ConnectionManager` — set on connection open and update on every received message
- [x] 5.2 Add watchdog timer (15s interval) to `ConnectionManager` — force-close WebSocket if no message received for 60s
- [x] 5.3 Start watchdog on `connect()`, clear on `disconnect()` and reconnect cycle
- [x] 5.4 Write tests for watchdog: verify force-close after 60s silence, verify no action when messages are received, verify cleanup on disconnect
