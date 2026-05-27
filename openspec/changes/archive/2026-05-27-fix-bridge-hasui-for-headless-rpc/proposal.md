## Why

Dashboard-spawned headless RPC sessions (`pi --mode rpc`) have `ctx.hasUI === false`. The bridge already patches `ctx.ui.notify/confirm/select/input/editor/multiselect` to forward through PromptBus to the dashboard — i.e. the dashboard IS a UI surface — but it never tells extensions that a UI exists. Extensions that branch on `ctx.hasUI` take the no-UI path: they either skip user interaction entirely or return data the RPC headless mode silently drops.

The visible symptom: built-in context-mode slash commands (`/ctx-stats`, `/ctx-doctor`) show a green "completed" pill in the dashboard chat but render nothing else. The handler runs:

```js
function handleCommandText(text, ctx) {
  if (ctx?.hasUI) { ctx.ui.notify(text, "info"); return; }
  return { text };   // ← lost in RPC headless mode
}
```

Same shape in `pi-agent-browser` (skips the install-prompt entirely when `!hasUI`), making auto-install of agent-browser silently fail in dashboard sessions.

## What Changes

- **Bridge extension SHALL set `ctx.hasUI = true` on the live `ctx` object** in `session_start`, immediately AFTER capturing the original value into `cachedHasUI` (which `source-detector` still consumes unchanged) AND AFTER it has installed PromptBus wrappers on `ctx.ui.*`. This signals to extensions that a UI is available — which is true: the dashboard provides it via PromptBus.
- **No behavior change** for tmux/wt sessions (`cachedHasUI` was already `true`; the assignment is a no-op).
- **No behavior change** for non-dashboard-spawned RPC sessions (bridge isn't loaded; nothing to patch).
- **Side effect documented**: `pi-web-access` defaults its search workflow to `"summary-review"` (curator window) when `hasUI` is truthy. Dashboard-spawned RPC sessions will now open the curator on web searches unless the user pins `workflow: "none"` in pi-web-access config. This is consistent with the dashboard's interactive nature and is documented in the migration note.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `bridge-extension`: Add a requirement that after the UI proxy is wired, the bridge SHALL set `ctx.hasUI = true` so extensions correctly detect the proxied dashboard UI.

## Impact

- **Code**: `packages/extension/src/bridge.ts` — single assignment after the existing `ctx.ui.*` patching block in the `session_start` handler.
- **Tests**: new unit / integration coverage in `packages/extension/src/__tests__/` verifying:
  - `ctx.hasUI` is flipped to `true` after proxy install (when bridge is wired and connection is present);
  - `cachedHasUI` retains the original value so `detectSessionSource` still classifies dashboard-spawned RPC sessions correctly;
  - `/ctx-stats` (simulated) reaches the `ctx.ui.notify` branch in a headless-RPC fixture.
- **Specs**: delta to `bridge-extension` adding the `hasUI` flip requirement.
- **Migration / compat**: documented behavior change for users of `pi-web-access` on dashboard-spawned RPC sessions — curator opens by default. Pin `workflow: "none"` in pi-web-access config to restore previous behavior.
- **Rollback**: revert the single bridge.ts line + restart server + reload bridges (`npm run reload`). No persisted state involved.
