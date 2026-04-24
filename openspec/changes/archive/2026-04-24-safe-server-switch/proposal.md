## Why

Switching servers in the ServerSelector dropdown is destructive-first and verify-never: clicking an entry wipes all in-memory session state, writes the new target to localStorage, and tears down the active WebSocket — all before confirming the new server is reachable. If the target doesn't respond (localhost with no pi-dashboard running, sleeping remote PC, stale mDNS entry), the UI empties, the WebSocket enters an infinite reconnect loop, and a browser refresh stays stuck because localStorage now points at the dead endpoint. Users who click "Local" with no local server — a legitimate misclick given "Local" is always listed first — soft-brick their tab with no visible error path.

## What Changes

- Server switching becomes a two-phase transaction: open the new WebSocket in parallel while keeping the old one alive; only swap state and persist to localStorage after the new connection reaches `open`.
- On switch failure (connection refused, timeout after ~5s), snap back to the previous server and surface a toast: "Couldn't reach <host>".
- localStorage for `pi-dashboard-last-server` is written only after a successful `ws.open` — never on click.
- ServerSelector probes every entry (including Local) eagerly on mount and re-probes every 30s, not only when the dropdown opens.
- Unreachable entries render dimmed with an "Unreachable" badge but remain clickable (user may know the server is about to come up); dimmed state is a hint, not a hard block.
- A persistent "Disconnected, retrying…" banner appears when the active WebSocket has been in a non-open state for more than 3 seconds, giving users a visible recovery path.
- **BREAKING for internal state only**: `handleServerSwitch` in `App.tsx` no longer synchronously clears `sessions`/`sessionStates`/`sessionCommands`/`sessionFlows`/`openspecMap`/`terminals`/`subscribedRef`; clearing is deferred to the post-open swap step.

## Capabilities

### New Capabilities

- `connection-status-banner`: Visible banner that appears when the client WebSocket has been disconnected for more than a threshold duration, with retry status and the currently-targeted server.

### Modified Capabilities

- `server-selector`: Switching becomes transactional (parallel-open + swap-on-success + revert-on-failure); localStorage persistence moves to post-open; all entries (including Local) are eagerly probed; unreachable entries render dimmed but remain clickable.

## Impact

- **Affected code**:
  - `packages/client/src/App.tsx` — `handleServerSwitch` rewrite, add banner mount point.
  - `packages/client/src/components/ServerSelector.tsx` — eager probing lifecycle, dimmed rendering for unreachable entries.
  - `packages/client/src/hooks/useWebSocket.ts` (or equivalent) — may need a parallel-connect helper or a second instance for the staging socket.
  - New: `packages/client/src/components/ConnectionStatusBanner.tsx`.
- **No server/API changes**: all work is client-side; no new REST endpoints, no protocol changes.
- **No config changes**: the shape of `pi-dashboard-last-server` in localStorage is unchanged — only the timing of writes changes.
- **Test impact**: add unit tests for the transactional switch state machine; no migration needed for existing users (stale localStorage entries self-heal on next successful switch).
