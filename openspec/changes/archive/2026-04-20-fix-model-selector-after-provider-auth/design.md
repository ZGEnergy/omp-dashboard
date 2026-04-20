## Context

The dashboard has a push-based chain for updating model lists after provider auth:

```
provider-auth-routes → credentials_updated → bridge → models_list → browser
```

This chain has silent failure points (empty catch blocks) and no client-side fallback. When the push fails, the client's `modelsMap` cache retains stale empty arrays, and the guard `!modelsMap.has(selectedId)` prevents re-requesting.

New sessions work because they go through `session_start` which calls `getAvailable()` fresh.

## Goals / Non-Goals

**Goals:**
- Existing sessions update their model list after provider auth without page reload
- Silent failures in the bridge's `credentials_updated` handler become visible via logging
- The fix is minimal and doesn't change existing architecture

**Non-Goals:**
- Rearchitecting the model push/pull system
- Adding polling or periodic model refresh
- Fixing model selector for ended/disconnected sessions (no bridge = no models)

## Decisions

### 1. Server broadcasts `models_refreshed` to browser clients after credential changes

**Rationale**: The existing `credentials_updated` goes to bridges (pi-gateway). Adding a parallel notification to browsers (browser-gateway) gives the client a direct signal that models may have changed. This is more reliable than depending on the full bridge round-trip.

**Alternative**: Have the client listen for provider auth status changes via polling — rejected as overly complex for a rare event.

### 2. Client clears `modelsMap` and re-requests on `models_refreshed`

**Rationale**: Clearing the map removes stale empty arrays. Re-requesting for the selected session gives immediate feedback. Other sessions will re-request lazily when selected (the `!modelsMap.has(selectedId)` guard naturally triggers).

**Alternative**: Only re-request for the selected session without clearing — rejected because other sessions would remain stale until page reload.

### 3. Add error logging in bridge `credentials_updated` handler

**Rationale**: The existing `/* ignore */` catch blocks hide failures. Using `console.error` makes issues visible in pi session logs without changing behavior.

## Risks / Trade-offs

- [Multiple `request_models` after auth] → Acceptable: happens once per auth event, and bridges handle it efficiently (no API calls, just registry lookup)
- [Race between `models_refreshed` clear and incoming `models_list` push] → No risk: both paths lead to the same outcome (updated modelsMap)
