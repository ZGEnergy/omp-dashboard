## Why

The folder-level OpenSpec section needs a "New Spec" button that spawns a new pi agent with `/opsx:explore` as the initial prompt. This enables creating new change proposals directly from the dashboard UI without needing an existing session. The spawned agent enters explore mode, thinks through the problem, and when a proposal is created, auto-attaches it to that session.

Depends on: `openspec-folder-card-ui` (provides the folder-level UI where the button lives).

## What Changes

- "New Spec" button on folder card's OpenSpec section spawns a new pi session with `/opsx:explore` as the initial prompt.
- Spawn mechanism extended to support an initial prompt: passed as a positional argument to `pi` CLI (e.g., `pi "/opsx:explore"`).
- ~~Fix: add regex for `openspec new change "name"` pattern in activity detector~~ *(Already implemented — `CLI_NEW_CHANGE_RE` exists in `openspec-activity-detector.ts` lines 38-39, added by `fix-openspec-activity-detection` archive.)*
- Auto-attach: when a proposal is created during the explore session, the activity detector catches the change name, and the existing server-side auto-attach logic attaches it to the creating session.

## Capabilities

### New Capabilities
- `new-spec-spawn`: "New Spec" button on folder card spawns a pi agent with `/opsx:explore`, auto-attaching the first created proposal.

### Modified Capabilities
- `process-manager`: Modified — `spawnPiSession` accepts optional `initialPrompt` parameter, passed as positional arg to pi CLI.
- `proposal-attachment`: *(Already done)* — activity detector `CLI_NEW_CHANGE_RE` regex was added by `fix-openspec-activity-detection` archive.

## Impact

- **Server** (`packages/server/src/`): `process-manager.ts` gains `initialPrompt` option. `browser-gateway.ts` handles new `spawn_spec_session` message type (or extends `spawn_session` with prompt field).
- **Extension** (`packages/extension/src/`): *(Already done)* `openspec-activity-detector.ts` already has `CLI_NEW_CHANGE_RE` regex (in `packages/shared/src/openspec-activity-detector.ts`).
- **Client** (`packages/client/src/`): "New Spec" button in folder OpenSpec section triggers spawn with prompt.
- **Protocol** (`packages/shared/src/`): `browser-protocol.ts` — `spawn_session` message extended or new message type for prompt-based spawn.
