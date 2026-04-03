## Context

The dashboard bridge extension maintains a WebSocket connection to the dashboard server (pi-gateway on port 9999). Session liveness is tracked via application-level heartbeats: the bridge sends `session_heartbeat` every 15s, and the server times out after 45s of silence.

Current failure mode: when the TCP connection silently dies (half-open state), the bridge still thinks `readyState === OPEN` and keeps sending heartbeats into the kernel buffer. The server never receives them, the 45s timer fires, and the session is marked "ended." The bridge doesn't know anything went wrong because it never gets an `error` or `close` event.

The system currently has 30+ concurrent sessions, each maintaining a WebSocket connection. Under heavy load (e.g., vitest spawning worker processes), connections can silently die. There is zero logging when sessions are unregistered, making diagnosis impossible.

## Goals / Non-Goals

**Goals:**
- Detect dead WebSocket connections within ~10 seconds instead of ~45 seconds
- Client-side detection of server unresponsiveness (don't rely only on server-side timeout)
- Diagnostic logging for all session lifecycle transitions
- Zero breaking changes — layer on top of existing heartbeat mechanism

**Non-Goals:**
- Changing the heartbeat interval (15s) or timeout (45s) — these remain as fallback
- Adding persistence or retry for ended sessions (that's auto-resume territory)
- Solving root cause of TCP connection drops (OS/network level)
- Server-side horizontal scaling or load balancing

## Decisions

### 1. WS-level ping/pong on pi-gateway

**Decision**: Add a periodic `ws.ping()` call from the server to each connected client, with a pong timeout.

**Rationale**: The `ws` library supports protocol-level ping/pong (RFC 6455 §5.5.2). Pong responses are handled automatically by the client's WebSocket implementation — no application code needed on the bridge side. This detects dead connections at the TCP level, not just the application level.

**Mechanism**:
- Server pings each connection every 30s
- If no pong received within 10s → `ws.terminate()` → triggers bridge reconnect
- Uses a per-connection `isAlive` flag pattern (standard `ws` library approach)

**Alternatives considered**:
- *Application-level ping/pong*: Would require bridge code changes and a new protocol message. WS-level is simpler and automatic.
- *TCP keepalive tuning*: OS-level, hard to configure portably, and doesn't give application-level feedback.

### 2. Bridge-side server liveness watchdog

**Decision**: Track time since last message received from server. If no message arrives for 60s, force-close the WebSocket to trigger reconnection.

**Rationale**: The bridge currently has no way to detect that the server has gone silent. Even with WS ping/pong from the server, a half-open connection from the client's perspective won't receive pings. The watchdog provides a complementary client-side check.

**Mechanism**:
- `ConnectionManager` tracks `lastMessageAt` timestamp (updated on any received message including pong frames)
- A watchdog timer checks every 15s: if `Date.now() - lastMessageAt > 60_000`, call `ws.close()` to trigger reconnect
- The 60s threshold is generous to avoid false positives (server may simply have nothing to say for a while)

**Why 60s?** The server sends heartbeat_ack every 15s (in response to bridge heartbeat). If 4 consecutive acks are missed, the connection is dead.

**Update**: Rather than adding a new `heartbeat_ack` message, the watchdog can simply use the WS-level pong frames as liveness signal. The server already pings every 30s, so the bridge should receive a ping (which it auto-responds to with pong) every 30s. If no ping arrives for 60s, the connection is dead.

However, Node.js built-in WebSocket may not expose ping/pong events to the application layer. To keep it simple: add a `heartbeat_ack` server→extension message that the server sends in response to each `session_heartbeat`. The bridge watchdog tracks receipt of these acks.

### 3. Server sends heartbeat_ack

**Decision**: When the server receives a `session_heartbeat`, it responds with `{ type: "heartbeat_ack" }` on the same WebSocket.

**Rationale**: This gives the bridge a definitive signal that the server is alive and processing messages. Unlike WS-level pong (which may not be observable in all WebSocket implementations), this is a regular application message that the `ConnectionManager` can track.

**Alternatives considered**:
- *No ack, rely on WS ping from server*: Node.js built-in WebSocket doesn't expose ping events to JS. We'd need to switch to the `ws` library on the bridge side too.
- *Periodic server→extension status message*: More complex, not needed — a simple ack per heartbeat is sufficient.

### 4. Session lifecycle logging

**Decision**: Add `console.log` statements in pi-gateway for key lifecycle events.

**Events to log**:
- Session registered: `[gateway] session registered: <id> cwd=<cwd>`
- Session unregistered (explicit): `[gateway] session unregistered: <id> (explicit)`
- Session unregistered (heartbeat timeout): `[gateway] session timed out: <id> (no heartbeat for 45s)`
- Session unregistered (sleep timeout): `[gateway] session timed out: <id> (sleep recovery failed)`
- WS ping timeout: `[gateway] connection dead (ping timeout): <id>`
- Connection closed: `[gateway] connection closed: <id>`

**Rationale**: Currently there is zero logging when sessions end. Any investigation requires reading source code and guessing.

## Risks / Trade-offs

- **[Risk] WS ping overhead with 30+ connections** → Minimal: one 2-byte ping frame per connection per 30s. Negligible bandwidth and CPU.
- **[Risk] False positive watchdog triggers** → 60s threshold with 15s heartbeat interval means 4 missed acks required. Very conservative.
- **[Risk] Node.js built-in WebSocket ping handling** → The `ws` library server sends pings; Node.js built-in WebSocket client auto-responds with pong at the protocol level. No application code needed on the client for pong response.
- **[Risk] Log noise** → Only lifecycle transitions are logged, not every heartbeat. Acceptable volume.
