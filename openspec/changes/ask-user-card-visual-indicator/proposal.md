## Why

When a session is waiting for user input via `ask_user` (an interactive UI dialog), the session card in the sidebar looks identical to any other tool execution — it shows "⚡ ask_user" in yellow with the working pulse animation. There is no visual distinction to alert the user that this session requires their attention. Users miss input requests, especially when monitoring multiple sessions.

## What Changes

- The `ActivityIndicator` component in `SessionCard.tsx` detects when `currentTool` is `"ask_user"` and renders a distinct "Waiting for input" indicator with a different color/icon instead of the generic tool execution display.
- The card border/glow styling changes when the session is waiting for input, making it stand out from cards that are just processing.
- The working pulse animation (`card-working-pulse`) is replaced with a different visual cue (e.g., a subtle attention-drawing style) when the session needs input.

## Capabilities

### New Capabilities
- `ask-user-card-indicator`: Visual indicator on session cards when a session is waiting for user input via ask_user, including distinct activity text, color treatment, and card styling that differentiates "needs input" from "processing".

### Modified Capabilities

## Impact

- `src/client/components/SessionCard.tsx` — `ActivityIndicator` component and card container styling
- No API changes, no protocol changes — uses existing `currentTool` field on `DashboardSession`
- Pure client-side visual change
