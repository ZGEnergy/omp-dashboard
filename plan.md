# Plan: Plan-Approval Host for `write xd://propose` (Issue #121)

## Overview
Implement the dashboard plan-approval host for `write xd://propose` (or `xdev.tool === "propose"`) using the existing `PromptBus` protocol (`prompt_request`, `prompt_response`, `prompt_dismiss`) without introducing any new WebSocket events or protocol messages.

---

## Key Constraints & Architecture Verdict

1. **Unreachable `@oh-my-pi` Extract:**
   `@oh-my-pi` source (`handlePlanApproval` / `#approvePlan`) is located outside this repository (`/home/joe/code/oh-my-pi/...`) and is not a dependency in `package.json`. Extracting code from `@oh-my-pi` is **unreachable**. The dashboard host must be implemented directly in `omp-dashboard` via existing PromptBus primitives.

2. **No New WebSocket Events:**
   Reuse the existing PromptBus infrastructure (`prompt_request` with `type: "select"`, `prompt_response`, `prompt_dismiss`).

3. **Input-Needed Classification:**
   `isInputNeededTool` MUST classify `write` as input-needed **ONLY** when `path === "xd://propose"` or `args?.xdev?.tool === "propose"` (or `toolName === "write:xd://propose"`). Plain `write` calls targeting ordinary files remain non-input-needed.

4. **Prompt Approval Presentation:**
   - Prompt opens **BEFORE** the `write` tool call finishes execution.
   - Dispatches a PromptBus `select` prompt with `metadata.toolCallId` attached so the client pairs the interactive UI card with the tool call.
   - **Payload:** Title + copyable `local://` path only. No full inline markdown preview.
   - **Options:**
     - `Approve and execute`: Approves plan and triggers plan execution flow.
     - `Refine plan`: Prompts for follow-up text input; keeps session in plan mode.
     - `Reject`: Dismisses prompt; keeps session in plan mode.

5. **Document Core Gap & Continuation Hook:**
   The actual `#approvePlan` continuation lives in the TUI (`@oh-my-pi`), which is unreachable. Dashboard answers reach continuation via PromptBus `respond`. The bridge implementation will define the exact continuation hook (`onPlanApproved` / `pi.events.emit("plan:approved", ...)`).

---

## Detailed Step-by-Step Implementation Plan

### Step 1: Shared Input-Needed Detection (`packages/shared/src/input-needed-tools.ts`)
- Update `isInputNeededTool` signature to accept `(toolName: string | null | undefined, args?: Record<string, unknown> | null)`.
- Implement `isProposeWrite(toolName: string | null | undefined, args?: Record<string, unknown> | null)` helper that checks:
  - `toolName === "write"` or `toolName === "write:xd://propose"`
  - AND (`args?.path === "xd://propose"` OR `args?.xdev?.tool === "propose"` OR `args?.path?.includes("xd://propose")`).
- Update `isInputNeededTool` to return `true` if `toolName === "ask_user" || toolName === "ask" || isProposeWrite(toolName, args)`.

### Step 2: Server Event Status Extraction & Push Classifiers
- Update `packages/server/src/event-status-extraction.ts`:
  - Pass tool call `args` / `path` when evaluating `isInputNeededTool(session.currentTool, args)`.
- Update `packages/server/src/event-wiring.ts`:
  - Ensure status extraction triggers input-needed attention signals when `write xd://propose` begins.
- Update `packages/server/src/push/build-push-payload.ts` & `packages/server/src/push/push-trigger-classifier.ts`:
  - Evaluate `isInputNeededTool(session.currentTool, session.currentToolArgs)` so push notifications classify `write xd://propose` in the `actions-required` bucket.

### Step 3: Extension Bridge Interception & PromptBus Dispatch (`packages/extension/src/bridge.ts`)
- Intercept `write` tool calls targeting `xd://propose` / `xdev.tool === "propose"`.
- When `write xd://propose` executes:
  1. Extract title (e.g. from `params.title` or first heading of `params.content`) and plan file path (`local://...`).
  2. BEFORE tool execution finishes (before returning from `execute`), issue PromptBus `request`:
     ```ts
     promptBus.request({
       id: `prompt-propose-${toolCallId}`,
       pipeline: "plan-approval",
       type: "select",
       question: `Plan Approval: ${title}\nPath: local://${planPath}`,
       options: ["Approve and execute", "Refine plan", "Reject"],
       metadata: { toolCallId, planPath, xdevTool: "propose" }
     })
     ```
  3. Await user response:
     - **Approve and execute ("Approve and execute")**: Resolves tool execution with success message (`Plan approved by user. Proceeding to execution.`); triggers bridge `onPlanApproved` hook / `pi.events.emit("plan:approved", { toolCallId, planPath })`.
     - **Refine plan ("Refine plan")**: Solicits follow-up refinement input from user; completes tool with refinement feedback; retains session in plan mode.
     - **Reject ("Reject") or Cancel**: Completes tool with rejection notice; retains session in plan mode.

### Step 4: Client Interaction & Event Reducer Pairing (`packages/client/src/...`)
- `packages/client/src/lib/event-reducer.ts`:
  - Ensure `toolCallId` pairing maps the PromptBus `select` prompt request directly to the `write` tool call.
- `packages/client/src/lib/session-status-visuals.ts` & `packages/client/src/components/SessionCard.tsx`:
  - Verify that `write xd://propose` correctly triggers the "Needs you" status pill, pulse animation, and attention stripes.

### Step 5: Document Core Gap & Continuation Hook Contract
- Add explicit architecture documentation in codebase comments (`packages/extension/src/bridge.ts` & `packages/shared/src/input-needed-tools.ts`):
  - Document that `@oh-my-pi` TUI `#approvePlan` continuation is external and unreachable from `omp-dashboard`.
  - Document the exact bridge hook contract (`onPlanApproved` listener via `pi.events`) through which dashboard PromptBus `respond` answers dispatch approval to host implementations.

### Step 6: Tests & Verification
- Unit tests:
  - `packages/shared/src/__tests__/input-needed-tools.test.ts`: Verify `isInputNeededTool` returns `true` for `write` with `path: "xd://propose"` or `xdev.tool: "propose"`, and `false` for normal `write`.
  - `packages/extension/src/__tests__/propose-tool-interception.test.ts`: Verify `write xd://propose` dispatches PromptBus `select` request with `toolCallId` before tool completes.
  - `packages/server/src/__tests__/event-status-extraction.test.ts`: Verify session status classification for propose write.

---

## Files to Modify & Create

### Files to Modify:
1. `packages/shared/src/input-needed-tools.ts`
2. `packages/server/src/event-status-extraction.ts`
3. `packages/server/src/event-wiring.ts`
4. `packages/server/src/push/build-push-payload.ts`
5. `packages/server/src/push/push-trigger-classifier.ts`
6. `packages/extension/src/bridge.ts`
7. `packages/client/src/lib/session-status-visuals.ts`
8. `packages/client/src/lib/event-reducer.ts`

### Files to Create:
1. `packages/shared/src/__tests__/input-needed-tools.test.ts` (or extend existing)
2. `packages/extension/src/__tests__/propose-tool-interception.test.ts`

---

## Summary Numbers
- **Files to modify:** 8
- **Files to create:** 2
- **Steps:** 6
