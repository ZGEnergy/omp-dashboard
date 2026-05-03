## Why

After dashboard server restart, the browser keeps a stale `sessions` Map across the WebSocket reconnect. The client clears `sessionOrderMap` and `terminals` but never clears `sessions`. Combined with timing of incremental `session_added` + `sessions_reordered` broadcasts during bridge reattach, the sidebar can render an actually-running session **below** the "Show N ended" divider until the user manually refreshes the page.

## What Changes

- **BREAKING (browser protocol)**: server emits a single `sessions_snapshot` message on browser connect, replacing the per-session `session_added` loop and per-cwd `sessions_reordered` loop currently sent at the start of `browser-gateway`'s `wss.on("connection")`.
- **Client REPLACES (does not merge)** its `sessions` Map and `sessionOrderMap` on receipt of `sessions_snapshot`. Stale entries from the previous server lifetime are dropped atomically.
- Live updates after the snapshot continue to use the existing incremental `session_added` / `session_updated` / `sessions_reordered` / `session_removed` messages.
- Reconnect handler in `App.tsx` no longer pre-clears `sessionOrderMap` (the snapshot replaces it). `subscribedRef` and `terminals` reset is preserved.
- Old browser tabs (pre-snapshot) connecting to a new server see no sessions until refreshed. Documented as accepted breakage; no version negotiation.

## Capabilities

### New Capabilities

(none — extends existing protocol + handlers)

### Modified Capabilities

- `shared-protocol`: add `SessionsSnapshotMessage` to `ServerToBrowserMessage` union.
- `browser-gateway-decomposition`: replace on-connect per-session/per-cwd send loops with one `sessions_snapshot` send.
- `app-decomposition`: reconnect handler no longer resets `sessionOrderMap` — snapshot does it.
- `session-listing`: `useMessageHandler` handles `sessions_snapshot` by REPLACING `sessions` and `sessionOrderMap` state, never merging.

## Impact

- `packages/shared/src/browser-protocol.ts` — new message type, union member.
- `packages/server/src/browser-gateway.ts` — on-connect emit path (~ lines 211–230).
- `packages/client/src/hooks/useMessageHandler.ts` — new case arm.
- `packages/client/src/App.tsx` — reconnect handler simplification.
- Tests:
  - `packages/server/src/__tests__/` — assert snapshot is sent exactly once on connect, contains all sessions + non-empty orders.
  - `packages/client/src/hooks/__tests__/` — assert snapshot REPLACES, drops stale ids, refreshes orders.
- No persistence change. No bridge-protocol change. No DB change.
