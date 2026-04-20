# Fix Model Selector After Provider Auth

## Problem

When a user opens the dashboard without provider credentials configured, sessions show the model selector as disabled ("no model"). After the user authenticates a provider (e.g., Anthropic OAuth in Settings), existing sessions still show the model selector as disabled — only newly spawned sessions get a working model list.

## Root Cause

The `credentials_updated` → bridge → `models_list` push chain exists but has two weaknesses:

1. **Silent failure**: Both `catch` blocks in the bridge's `credentials_updated` handler use `/* ignore */`, so if `authStorage.reload()` or `getAvailable()` fails, there's no visibility.

2. **No client-side fallback**: The client caches models per-session in `modelsMap`. If the push from `credentials_updated` fails to arrive (bridge disconnected, timing issue, error swallowed), there's no retry mechanism. The client's `request_models` is only sent once per session (guarded by `!modelsMap.has(selectedId)`).

## Proposed Fix

**Server-side**: When a provider auth credential is saved, broadcast a `models_refreshed` notification to all browser clients (not just bridges). This tells the client that model lists may have changed.

**Client-side**: On receiving `models_refreshed`, clear `modelsMap` so the next session selection triggers a fresh `request_models`. Also re-request models for the currently selected session immediately.

**Bridge-side**: Add error logging in the `credentials_updated` handler to aid future debugging.

## Scope

- `packages/server/src/routes/provider-auth-routes.ts` — broadcast browser notification after credential write
- `packages/server/src/event-wiring.ts` — no changes needed (models_list broadcast already works)
- `packages/shared/src/browser-protocol.ts` — add `models_refreshed` message type
- `packages/client/src/hooks/useMessageHandler.ts` — handle `models_refreshed` by clearing modelsMap
- `packages/client/src/App.tsx` — re-request models for selected session after clear
- `packages/extension/src/bridge.ts` — add `console.error` in credentials_updated catch blocks

## Alternatives Considered

1. **Clear modelsMap on reconnect** (line ~263 in App.tsx): Would fix the case where login causes a reconnect, but `credentials_updated` doesn't cause a reconnect — the WS stays connected.

2. **Client polls for model changes**: Overly complex for a rare event.

3. **Just fix the bridge catch blocks**: Addresses visibility but not the fundamental lack of a client-side fallback. The push chain has too many silent failure points to rely on exclusively.

## Complexity

Low — ~20 lines across 4-5 files. No architectural changes.
