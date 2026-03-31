## Context

The UI proxy in `src/extension/ui-proxy.ts` uses `Promise.race` to let both TUI and dashboard answer `ask_user` dialogs simultaneously. The first response wins. However, neither side is notified when the other wins, leaving stale dialogs open, leaking memory, and confusing users.

Pi's `ExtensionUIDialogOptions` already supports `signal?: AbortSignal` for programmatic dismissal of TUI dialogs. This is used by pi-flows but not by the dashboard bridge.

## Goals / Non-Goals

**Goals:**
- Cancel the losing side when either TUI or dashboard answers first
- Clean up pending Map entries to prevent memory leaks
- Dismiss stale dashboard dialogs via a new protocol message
- Dismiss stale TUI dialogs via AbortSignal

**Non-Goals:**
- Routing `ask_user` exclusively to the prompt source (TUI vs dashboard) — both sides still see the dialog
- Changes to pi-flows' `FlowIOAdapter` or `AskUserQueue` — those use `ctx.ui` which is already patched
- Changes to the `ask_user` tool registration itself

## Decisions

- **Use AbortSignal to dismiss TUI dialogs**: Pi already supports `{ signal: AbortSignal }` in `ExtensionUIDialogOptions`. Creating an `AbortController` per dialog call and aborting when dashboard wins is zero-dependency and clean.
  - Alternative: Custom event/callback mechanism — rejected because AbortSignal is already supported natively.

- **New `extension_ui_dismiss` message rather than reusing `extension_ui_response`**: The dismiss is extension→server→browser direction, while `extension_ui_response` is browser→server→extension. Using a separate message type keeps the protocol semantics clear.
  - Alternative: Send a synthetic `extension_ui_response` with `cancelled: true` from the bridge — rejected because it conflates "user cancelled" with "answered elsewhere" and goes against the message direction convention.

- **Show "Answered in terminal" in dashboard rather than silently removing the card**: Users should understand what happened rather than seeing a card mysteriously vanish.
  - Alternative: Remove the card entirely — rejected because it's disorienting.

- **Wire cancellation via `.then()` on both promises before `Promise.race`**: Both `.then()` handlers are registered before the race starts. When TUI wins, its `.then()` cleans up dashboard. When dashboard wins, its `.then()` aborts TUI. The already-settled `Promise.race` ignores late resolutions.

## Risks / Trade-offs

- **AbortSignal behavior on abort**: When aborted, `ctx.ui.confirm` resolves with `false`, `select/input` resolve with `undefined`. These late resolutions are harmless since `Promise.race` already settled. Risk is low.
- **Timing edge case**: If both answer within the same microtask, `Promise.race` picks one and the other's `.then()` fires immediately to clean up. No actual race condition since cleanup is idempotent.
- **Dashboard reconnect with stale pending**: `resendPending()` only resends entries still in the Map. Since TUI-won entries are immediately deleted, they won't be resent. This is correct behavior.
