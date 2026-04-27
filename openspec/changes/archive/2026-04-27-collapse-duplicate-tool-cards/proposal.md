## Why

The chat view rendered visual duplicates around `ask_user` (and any other interactive-prompt tool) in two cases:

1. **Live duplication.** While a question is awaiting a response, the user saw two cards stacked: a `ToolCallStep` (running) showing the question header + body, and immediately below it the `InteractiveUiCard` (pending) showing the same question + Allow/Deny/Cancel buttons. The two cards have the same content; only one is interactive.
2. **Failed-then-retried noise.** When a model emits a malformed tool-call (e.g. Claude Opus 4.7 occasionally emits `{}` for `ask_user`), the schema rejection produces a loud red "Validation failed" card. The model then self-recovers by retrying with valid arguments, producing a second card right next to the first. The result looks like a "repeated message" bug to users (see session `019dd05c…`), even though the runtime is behaving correctly.

Both cases are presentation problems, not protocol problems — the bridge schema rejection MUST keep firing so models are forced to retry with valid arguments. The fix is purely client-side filtering of the message stream before render.

## What Changes

- A pure helper module `packages/client/src/lib/collapse-retried-errors.ts` SHALL expose two functions:
  - `findRetriedErrorIds(messages)` — returns the set of error `toolResult` ids that were immediately superseded by a successful retry of the same tool. Look-ahead skips `assistant` / `thinking` / `turnSeparator` / `rawEvent` / `commandFeedback`; any other intervening message (user, different-tool result, chained error) aborts collapse.
  - `findActiveInteractiveToolResultIds(messages)` — returns the set of `running` `toolResult` ids paired with a *pending* `interactiveUi` message that follows them (using the same skip-roles set).
- A new component `packages/client/src/components/RetriedErrorBadge.tsx` SHALL render a one-line `⚠ <toolName> failed — retried ›` pill in place of the full `ToolCallStep` for ids returned by `findRetriedErrorIds`. Clicking the pill toggles an expansion that reveals the original `ToolCallStep` (status `error`) including the validation message and `Received arguments:` JSON. Clicking again collapses.
- `ChatView.tsx` SHALL hide message ids returned by `findActiveInteractiveToolResultIds` (return `null`) so only the `InteractiveUiCard` renders during a pending question. Once the prompt resolves, the toolResult flips to `complete`, the helper no longer matches, and the full tool-call card appears in history alongside the now-tiny `ConfirmRenderer`-style status pill from the existing `InteractiveUiCard` resolved state.
- A regression unit test in `packages/extension/src/__tests__/ask-user-tool.test.ts` SHALL assert that `prepareArguments({})` returns an empty object (no synthetic `method` / `title` / `questions`), so the framework's runtime schema validator continues to reject the empty-args case exactly as it did in session `019dd05c…`.

## Capabilities

### Modified Capabilities

- `chat-view`: add a requirement for collapsing failed-then-retried `toolResult` cards into an expandable badge; add a requirement for hiding the running `toolResult` paired with a pending `interactiveUi`.
- `ask-user-tool`: add a requirement that `prepareArguments({})` does NOT synthesize a method (preserving the schema-rejection contract).

## Impact

- **Code (additions)**:
  - `packages/client/src/lib/collapse-retried-errors.ts` (new pure helper module, two exported functions)
  - `packages/client/src/lib/__tests__/collapse-retried-errors.test.ts` (15 cases — 8 retry, 7 active-interactive)
  - `packages/client/src/components/RetriedErrorBadge.tsx` (new compact-pill component with expand/collapse toggle)
- **Code (modifications)**:
  - `packages/client/src/components/ChatView.tsx` (computes both id sets via `useMemo`; renders `<RetriedErrorBadge>` for retried errors; returns `null` for hidden running toolResults)
  - `packages/extension/src/__tests__/ask-user-tool.test.ts` (regression case: `prepareArguments({})` stays empty)
- **No protocol changes**: pi `tool_execution_*` events and PromptBus `prompt_request` events are unchanged. The bridge tool schema is unchanged. The client filters its own message array.
- **No server changes**: server-side event forwarding is unchanged.
- **No breaking changes**: existing tool-call rendering is unchanged for any tool that does not match the helper conditions.
