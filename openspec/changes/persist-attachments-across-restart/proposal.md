## Why

When the dashboard server restarts, session attachments (attached OpenSpec proposals) are lost. The `register()` method in `memory-session-manager.ts` creates a fresh session object, discarding persisted fields like `attachedProposal`. Sessions are persisted to `sessions.json` with attachments intact, but the data is overwritten when the extension re-registers.

## What Changes

- When a session re-registers with a known ID that has persisted data, the server SHALL merge persisted fields (like `attachedProposal`) into the new session object instead of discarding them.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `session-listing`: Session registration merges with persisted data to preserve attachments and other user-set fields across server restarts.

## Impact

- **Server** (`src/server/memory-session-manager.ts`): `register()` should check if a persisted session exists with the same ID and merge relevant fields (`attachedProposal`, `name` if user-renamed, etc.).
- **Server** (`src/server/session-persistence.ts`): No changes needed — already persists `attachedProposal`.
