## Why

When switching between session cards in the dashboard, events are displayed multiple times. The `event_replay` handler in `App.tsx` reduces replayed events on top of the existing `SessionState`, causing duplicate messages in the chat view. After a browser refresh the state is correct because it starts from a clean initial state.

## What Changes

- Reset session state to `createInitialState()` before applying a full event replay (when `lastSeq` is 0 or the replay covers the full history)
- This ensures switching to a previously-subscribed session or re-subscribing after reconnect doesn't produce duplicate messages

## Capabilities

### New Capabilities
_(none)_

### Modified Capabilities
_(none — this is a bug fix in the client-side event reducer logic)_

## Impact

- `src/client/App.tsx` — `event_replay` case in `handleMessage`: reset state before reducing replayed events
- No server or protocol changes needed
