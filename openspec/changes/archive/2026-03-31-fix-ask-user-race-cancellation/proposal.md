## Why
The UI proxy's `Promise.race` between TUI and dashboard dialogs has no cancellation — when one side answers, the other remains open. This causes stale TUI dialogs blocking the terminal, stale dashboard dialogs stuck in "pending" forever, memory leaks in the pending request Map, and confusing UX where both sides show the same unanswered prompt.

## What Changes
- Add `AbortSignal` support to TUI dialog calls in the UI proxy so the dashboard can dismiss TUI dialogs when it wins the race
- Add `extension_ui_dismiss` protocol message (extension→server→browser) so the bridge can tell the dashboard to dismiss a dialog when TUI wins
- Clean up the pending Map immediately when TUI wins the race
- Handle dismiss on the browser side by transitioning interactive renderers from "pending" to a dismissed state

## Impact
- Affected specs: `extension-ui-forwarding`, `interactive-ui-dialogs`
- Affected code: `src/extension/ui-proxy.ts`, `src/shared/protocol.ts`, `src/shared/browser-protocol.ts`, `src/server/pi-gateway.ts`, `src/server/browser-gateway.ts`, `src/client/lib/event-reducer.ts`, `src/client/components/interactive-renderers/`
