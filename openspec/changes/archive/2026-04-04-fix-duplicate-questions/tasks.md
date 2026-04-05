## Tasks

- [x] **Task 1: Remove ask_user interactive renderer branch from ToolCallStep** — Remove the `if (toolName === "ask_user" && args?.method)` block and the `parseAskUserResult` helper from `src/client/components/ToolCallStep.tsx`. Clean up unused imports (`getInteractiveRenderer`, etc.). The `ask_user` tool will render as a standard collapsible tool step.

- [x] **Task 2: Add tests for ask_user tool call rendering** — Create/update `src/client/components/__tests__/ToolCallStep.test.tsx` to verify `ask_user` renders as a collapsible tool step (not an InteractiveRenderer), summary shows the title, and expanding shows the raw result.

- [x] **Task 3: Verify no regressions** — Run full test suite, confirm `interactiveUi` messages still render correctly, confirm non-ask_user tools are unaffected.
