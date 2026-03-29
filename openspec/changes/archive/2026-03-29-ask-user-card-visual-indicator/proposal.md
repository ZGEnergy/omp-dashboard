## Why

When a session is waiting for user input via `ask_user` (an interactive UI dialog), the session card in the sidebar looks identical to any other tool execution — it shows "⚡ ask_user" in yellow with the working pulse animation. There is no visual distinction to alert the user that this session requires their attention. Users miss input requests, especially when monitoring multiple sessions.

## What Changes

- The `ActivityIndicator` component in `SessionCard.tsx` detects when `currentTool` is `"ask_user"` and renders a "Waiting for input" label instead of the generic "⚡ ask_user" tool text.
- The card uses a different pulsating color (e.g., purple pulse) instead of the current `card-working-pulse` when the session is waiting for input, so it's visually distinct from "processing" at a glance.

## Capabilities

### New Capabilities
- `ask-user-card-indicator`: Visual indicator on session cards when a session is waiting for user input via ask_user, including distinct activity text, color treatment, and card styling that differentiates "needs input" from "processing".

### Modified Capabilities

## Impact

- `src/client/components/SessionCard.tsx` — `ActivityIndicator` component and card container styling
- No API changes, no protocol changes — uses existing `currentTool` field on `DashboardSession`
- Pure client-side visual change
