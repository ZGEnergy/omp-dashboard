## Why

Sometimes the chat view gets out of sync or the user simply wants a clean re-fetch of all session events. Currently the only option is a full page reload, which loses all client state (selected session, scroll position in other sessions, etc.). A lightweight refresh button scoped to the current session would be faster and less disruptive.

## What Changes

- Add a refresh icon button to the **SessionHeader** component, next to existing action icons.
- Clicking it clears the local event state for that session and re-subscribes with `lastSeq: 0`, triggering a full event replay from the server.
- A brief loading/spinning state on the icon while replay is in progress.

## Capabilities

### New Capabilities

- `chat-refresh`: Refresh button in the session header that re-fetches all events for the currently viewed session without a full page reload.

### Modified Capabilities

_(none)_

## Scope

- **In scope**: Refresh button in SessionHeader, clear + re-subscribe logic, loading indicator.
- **Out of scope**: Auto-refresh, periodic polling, retry on failure.
