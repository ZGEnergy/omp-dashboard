# Research: Plan-Approval Host for `write xd://propose` (Issue #121)

- **Task ID:** `plan-approval-host-xd-propose`
- **Issue:** https://github.com/ZGEnergy/omp-dashboard/issues/121
- **Branch:** `team/plan-approval-host-xd-propose`
- **Worktree:** `/home/joe/code/zge-workspace/worktrees/omp-dashboard/plan-approval-host-xd-propose`
- **Locked Design:** Option A (Dashboard Host via PromptBus)

---

## 1. Reachability Assessment of `@oh-my-pi`

- `oh-my-pi` source is located in `/home/joe/code/oh-my-pi/packages/coding-agent/src/modes/interactive-mode.ts` (`handlePlanApproval`).
- `omp-dashboard` does NOT include `@oh-my-pi` in its `package.json` dependencies or `node_modules`.
- **Verdict:** Extracting `handlePlanApproval` from `@oh-my-pi` is **unreachable** from this repo checkout.
- Per Locked A instructions: Dashboard host must be implemented directly in `omp-dashboard` via existing PromptBus protocols, and the core gap documented without inventing any new WebSocket events.

---

## 2. Core Components & Architecture Seam

### 2.1 Input-Needed Detection
- Currently `packages/shared/src/input-needed-tools.ts` (`isInputNeededTool`) checks `toolName === "ask_user" || toolName === "ask"`.
- Must be extended (or augmented via `isInputNeededWrite`) to recognize running `write` tool calls where `path === "xd://propose"` or `xdev.tool === "propose"`.
- `packages/server/src/event-status-extraction.ts` and push trigger classifiers must be updated accordingly so session cards light up the "Needs you" visual state.

### 2.2 Host Opening & `toolCallId` Pairing
- The plan-approval prompt must open **BEFORE** the `write` tool call completes execution.
- Bridge extension (`packages/extension/src/bridge.ts`) intercepts `write xd://propose`, emits `prompt_request` with `metadata.toolCallId` attached before resolving the tool result.
- `packages/client/src/lib/event-reducer.ts` pairs `toolCallId` onto the `interactiveUi` chat message.

### 2.3 UI & PromptBus Interactions
- Protocol: Reuses existing PromptBus (`prompt_request`, `prompt_response`, `prompt_dismiss`).
- **Body:** Title + copyable `local://` path (no full inline preview).
- **Options:**
  1. `Approve` ("Approve and execute") -> Triggers plan execution (`#approvePlan` equivalent in TUI).
  2. `Refine` -> Follow-up text input; keeps session in plan mode.
  3. `Reject / Cancel` -> Dismisses prompt; keeps session in plan mode.

---

## 3. Files Identified for Implementation

1. `packages/shared/src/input-needed-tools.ts`: Add `write xd://propose` check.
2. `packages/server/src/event-status-extraction.ts`: Recognize input-needed status for `write xd://propose`.
3. `packages/extension/src/bridge.ts`: Intercept `write xd://propose` and dispatch PromptBus request before tool end.
4. `packages/client/src/components/interactive-renderers/PlanApprovalRenderer.tsx` (or `SelectRenderer.tsx` extension): Render plan approval dialog cards.
5. `packages/client/src/hooks/useSessionActions.ts` & `packages/client/src/lib/prompt-answer-encoder.ts`: Encode plan approval response choices (Approve/Refine/Reject).

---

## 4. Risks Identified

1. **Unreachable `@oh-my-pi` Core Gap:** Dashboard cannot execute internal `@oh-my-pi` TUI handlers (`#runPlanApprovalResolve`, role model cycles, compact context) directly since package is unlinked.
2. **Tool Call Pairing Race:** `prompt_request` must be dispatched to server/client synchronously when `write xd://propose` begins execution, before `tool_execution_end` arrives.
3. **Plan Mode State Preservation:** On Refine or Reject/Cancel, session state must explicitly stay in plan mode rather than unblocking into execution.
