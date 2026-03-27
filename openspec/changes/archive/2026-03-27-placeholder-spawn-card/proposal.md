## Why

When a user clicks "New" to spawn a session, there is no immediate visual feedback in the session list — just a toast after the server responds. The session card only appears later when `session_added` arrives. This gap causes confusion (did it work?) and allows accidental double-spawns by clicking "New" multiple times.

## What Changes

- Show a placeholder skeleton card at the top of the group immediately when "New" is clicked, with a loading/pulse animation
- Disable the "New" button for that specific group while a spawn is in progress (other groups remain unaffected)
- Replace the placeholder with the real session card when `session_added` arrives for that cwd
- Remove the placeholder and show error toast on spawn failure
- Add a safety timeout to remove the placeholder if neither `session_added` nor `spawn_result` arrives

## Capabilities

### New Capabilities
- `placeholder-spawn-card`: Placeholder card with loading animation shown during session spawn, per-group spawn locking, and automatic replacement with real session card

### Modified Capabilities
None — this is purely additive UI behavior; no existing spec requirements change.

## Impact

- `src/client/App.tsx` — Track `spawningCwds` state, clear on `session_added` or `spawn_result` failure
- `src/client/components/SessionList.tsx` — Accept `spawningCwds` prop, disable "New" button per-group, render placeholder card at top of group
- New component `src/client/components/PlaceholderSessionCard.tsx` — Skeleton card with pulse animation
- No server-side or protocol changes required
