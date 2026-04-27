## Why

A resolved `ask_user` tool call in the chat view shows the same green check icon used by every other tool (`bash`, `read`, `edit`, …). Visually this conflates "the agent ran a command" with "the agent asked you a question and you answered it". On a long history, distinguishing user-interaction events at a glance is valuable — they're the points where the run depended on a human decision.

## What Changes

- `packages/client/src/components/ToolCallStep.tsx` SHALL render a sky-blue `mdi-help-circle-outline` (`?`) icon in place of the standard green-check `mdi-check` icon when `toolName === "ask_user"` AND `status === "complete"`. The override SHALL NOT apply to `status === "running"` (which keeps the yellow spinner) or `status === "error"` (which keeps the red alert) so the existing failure / in-flight semantics are preserved.

## Capabilities

### Modified Capabilities

- `chat-view`: add a requirement for the `ask_user` resolved-state icon override.

## Impact

- **Code (modifications)**:
  - `packages/client/src/components/ToolCallStep.tsx` (import `mdiHelpCircleOutline`, branch on `isAskUser && status !== "error" && status !== "running"` for icon + color)
- **No protocol changes**, no server changes, no breaking changes.
