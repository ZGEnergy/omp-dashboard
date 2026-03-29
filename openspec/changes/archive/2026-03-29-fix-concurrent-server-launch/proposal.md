## Why

When multiple pi agents start simultaneously, they all probe the dashboard server port, find it closed, and all attempt to launch the server. Only the first succeeds — the rest fail with "Server process exited immediately" because the port is already taken. This produces a misleading warning notification in every agent except the first, even though the server is running fine.

## What Changes

- After a failed `launchServer` attempt in the bridge extension, re-probe the port to check if another agent started the server concurrently
- If the port is now open after a failed launch, suppress the warning notification (the server is running)
- Only show the failure warning if the port is still closed after the retry probe

## Capabilities

### New Capabilities

_(none — this is a small behavioral fix within an existing capability)_

### Modified Capabilities

- `bridge-extension`: Add a retry-probe requirement to the auto-start logic so concurrent launches don't produce false failure warnings

## Impact

- **Code:** `src/extension/bridge.ts` — the `isPortOpen` / `launchServer` block in the `session_start` handler
- **Behavior:** No more spurious "Dashboard server failed to start" warnings when multiple agents race to start the server
- **Risk:** Minimal — only adds a single re-check after an already-failed path
