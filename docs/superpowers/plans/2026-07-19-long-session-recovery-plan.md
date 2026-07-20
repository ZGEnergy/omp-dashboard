# Long Session Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make long, tool-dense transcript recovery visibly progress, retain usable pagination controls, and keep pending interactive prompts reachable outside virtualized history.

**Architecture:** Preserve server replay framing and sequence-ledger semantics. Extend the existing client replay-window metadata with `partialHead`, correct client-side cursor and anchor-latch edge cases, and add bounded conversational-row discovery in `ChatView`. Render a single pending non-widget interactive request in a persistent nonvirtual prompt bar; resolved and cancelled requests remain historical rows.

**Tech Stack:** React, TypeScript, TanStack Virtual, Vitest, Testing Library.

## Global Constraints

- Preserve `EventReplayMessage` wire fields and `SessionReplayLedger` admission semantics.
- Do not increase server replay budget or replace event-window selection.
- Keep viewport anchor stable while an older page prepends rows.
- Auto-page at most 3 older pages per user request; stop after a user or assistant row appears.
- Keep widget-bar prompt placement owned by its plugin slot.
- Keep resolved and cancelled interactive requests in transcript history.
- Write tests before production code for every changed behavior.

---

## File Structure

- `packages/client/src/lib/replay-window.ts`: merge authoritative replay-window metadata, including the partial-history marker.
- `packages/client/src/hooks/useSessionReplayController.ts`: forward existing wire `partialHead` metadata into application state.
- `packages/client/src/App.tsx`: retain safe `minSeq === 0` semantics and provide current replay-window state to `ChatView`.
- `packages/client/src/components/ChatView.tsx`: show replay outcome/partial-history context, recover stale anchors, bound automatic older-page discovery, and host active prompt bar.
- `packages/client/src/lib/__tests__/replay-window.test.ts`: lock replay-window merge behavior.
- `packages/client/src/hooks/__tests__/useSessionReplayController.test.ts`: lock `partialHead` forwarding.
- `packages/client/src/components/__tests__/ChatView.ask-user-suppression.test.tsx`: prove pending prompt stays outside transcript virtualization.
- `packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`: prove stale pagination authority releases latch and older-page feedback remains observable.

### Task 1: Replay-window metadata and safe pagination cursor

**Files:**
- Modify: `packages/client/src/lib/replay-window.ts`
- Modify: `packages/client/src/lib/__tests__/replay-window.test.ts`
- Modify: `packages/client/src/hooks/useSessionReplayController.ts`
- Modify: `packages/client/src/hooks/__tests__/useSessionReplayController.test.ts`
- Modify: `packages/client/src/App.tsx`

**Interfaces:**
- Produces `ReplayWindow.partialHead: boolean`.
- Produces `ReplayWindowFrame.partialHead: boolean | null`.
- Produces `ReplayWindowMetadata.partialHead: boolean | null`.
- `ChatView` receives `partialHead?: boolean` from `App`.

- [ ] **Step 1: Write failing replay-window tests**

```ts
expect(
  mergeReplayWindow(undefined, { kind: "cold", minSeq: 0, hasMoreOlder: true, partialHead: true }, 0),
).toEqual({ minSeq: 0, hasMoreOlder: true, partialHead: true });

expect(
  mergeReplayWindow(
    { minSeq: 30, hasMoreOlder: true, partialHead: true },
    { kind: "delta", minSeq: 31, hasMoreOlder: false, partialHead: false },
    31,
  ),
).toEqual({ minSeq: 30, hasMoreOlder: true, partialHead: true });
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm test -- packages/client/src/lib/__tests__/replay-window.test.ts`

Expected: TypeScript test failure because `partialHead` does not exist.

- [ ] **Step 3: Implement minimal replay-window merge**

```ts
export interface ReplayWindowFrame {
  minSeq: number | null;
  hasMoreOlder: boolean | null;
  partialHead: boolean | null;
  kind: "cold" | "delta" | "older";
}

export interface ReplayWindow {
  minSeq: number;
  hasMoreOlder: boolean;
  partialHead: boolean;
}
```

Use nullish coalescing, never `||`, when deriving `minSeq`; zero is a valid cursor. Cold replaces `partialHead`; older pages replace it with their boundary marker; delta preserves previously established `partialHead`.

- [ ] **Step 4: Forward protocol metadata and retain zero cursor**

```ts
this.effects.window?.(message.sessionId, {
  minSeq: message.windowMinSeq ?? null,
  hasMoreOlder: typeof message.hasMoreOlder === "boolean" ? message.hasMoreOlder : null,
  partialHead: typeof message.partialHead === "boolean" ? message.partialHead : null,
  kind: message.replayKind,
});
```

In `App.handleLoadOlder`, remove the `win.minSeq > 0` rejection. Let `hasMoreOlder` authoritatively control whether an older request starts; `buildLoadOlderSubscribe` already receives the ledger cursor.

- [ ] **Step 5: Add controller-forwarding test, then run focused tests**

Run: `npm test -- packages/client/src/lib/__tests__/replay-window.test.ts packages/client/src/hooks/__tests__/useSessionReplayController.test.ts`

Expected: PASS. Existing delta-window and older-ledger tests continue to pass.

### Task 2: Conversational recovery feedback and stale-anchor release

**Files:**
- Modify: `packages/client/src/components/ChatView.tsx`
- Modify: `packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`
- Modify: `packages/client/src/App.tsx`

**Interfaces:**
- Consumes `partialHead`, `hasMoreOlder`, `loadingOlder`, `completedOlderAnchorToken`.
- Produces nonvirtual header status for partial history and last older-page result.
- Produces a bounded `onLoadOlder(anchorToken)` retry when a completed older page contributes no `user` or `assistant` row.

- [ ] **Step 1: Write failing ChatView tests**

```tsx
expect(screen.getByTestId("partial-history-notice")).toHaveTextContent("Earlier conversation is still available");

await user.click(screen.getByTestId("load-older-button"));
completeOlderPageWithStaleAuthority();
await user.click(screen.getByTestId("load-older-button"));
expect(onLoadOlder).toHaveBeenCalledTimes(2);
```

Add a tool-dense older-page fixture with no user/assistant row. Assert status text reports a loaded page without conversational messages, the viewport anchor remains unchanged, and automatic continuation stops after three requests.

- [ ] **Step 2: Run focused ChatView test and verify RED**

Run: `npm test -- packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`

Expected: FAIL because no partial-history notice/outcome status exists and stale authority leaves the request latch held.

- [ ] **Step 3: Implement stale release and visible recovery outcome**

At the first stale-authority return in the older-anchor restore effect, clear both `pendingOlderAnchorRef.current` and `olderRequestLatchRef.current`. Add header-only state derived from completed older pages: `Loaded earlier messages`, `Loaded older activity; continuing to prior conversation`, and `No earlier conversation remains`. Render partial-history notice outside `chat-scroll-container`.

- [ ] **Step 4: Implement bounded automatic discovery**

Count conversational rows before each older request. After completion, if the page added no row with `role === "user" || role === "assistant"`, `hasMoreOlder` remains true, and automatic attempts are below 3, request the next page using the existing anchor/latch flow. Reset the counter after a conversational row appears, a user request, session change, error, or exhausted history.

- [ ] **Step 5: Run focused ChatView tests**

Run: `npm test -- packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx`

Expected: PASS. Tests prove second request becomes possible after stale authority, header exposes partial history, and automatic pagination remains bounded.

### Task 3: Persistent pending interactive prompt bar

**Files:**
- Modify: `packages/client/src/components/ChatView.tsx`
- Modify: `packages/client/src/components/__tests__/ChatView.ask-user-suppression.test.tsx`

**Interfaces:**
- Consumes live `interactiveUi` messages with `{ requestId, method, params, status, result }`.
- Produces one `data-testid="active-interactive-prompt"` outside `data-testid="chat-scroll-container"` for the latest pending non-widget request.
- Reuses `InteractiveUiCard` and `onRespondToUi(requestId, result?, cancelled?)`.

- [ ] **Step 1: Write failing prompt-bar tests**

```tsx
const { container, getByTestId, getByText } = renderChat([
  askUserToolResult({ toolStatus: "running" }),
  interactiveUi("pending"),
  ...toolBurst(200),
]);

expect(getByTestId("active-interactive-prompt")).not.toBeNull();
expect(container.querySelector('[data-testid="chat-scroll-container"]')?.textContent).not.toContain("Yes");
expect(getByText("Yes")).toBeTruthy();
expect(toolCardButton(container)).toBeNull();
```

Add a resolved request case asserting no persistent bar and an inline historical response remains.

- [ ] **Step 2: Run focused prompt test and verify RED**

Run: `npm test -- packages/client/src/components/__tests__/ChatView.ask-user-suppression.test.tsx`

Expected: FAIL because pending prompt remains inside virtualized transcript.

- [ ] **Step 3: Implement minimal persistent renderer**

Derive the latest pending non-widget `interactiveUi` request from `filteredMessages`. Exclude only that request from `displayRows`; preserve resolved/cancelled `interactiveUi` rows. Render:

```tsx
{activeInteractiveRequest && (
  <div data-testid="active-interactive-prompt" className="shrink-0 border-t border-[var(--border-secondary)] bg-[var(--bg-primary)] p-2">
    <InteractiveUiCard request={activeInteractiveRequest} onRespondToUi={onRespondToUi} />
  </div>
)}
```

Place the bar after `chat-scroll-container`, keeping plugin widget-bar prompts excluded. Preserve `interactiveToolCallIds` suppression for all paired live `ask_user` cards.

- [ ] **Step 4: Run focused prompt test and verify GREEN**

Run: `npm test -- packages/client/src/components/__tests__/ChatView.ask-user-suppression.test.tsx`

Expected: PASS. Pending prompt remains actionable after a tool burst; completed request stays historical.

### Task 4: Integration verification and review

**Files:**
- Modify: nearest `AGENTS.md` rows for every changed source/test file.

- [ ] **Step 1: Run combined unit suite**

Run: `npm test -- packages/client/src/lib/__tests__/replay-window.test.ts packages/client/src/hooks/__tests__/useSessionReplayController.test.ts packages/client/src/components/__tests__/ChatView.scroll-race.test.tsx packages/client/src/components/__tests__/ChatView.ask-user-suppression.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run type and changed-quality verification**

Run: `npm run quality:changed`

Expected: exit 0.

- [ ] **Step 3: Smoke-test live dashboard**

Open a tool-dense session in mobile viewport. Click `Load older messages`; observe status changes or conversational-page discovery within three pages. Confirm partial-history notice appears when `partialHead` is true. Trigger `ask_user`, scroll tool activity, and confirm active prompt bar stays visible and responds.

- [ ] **Step 4: Run code-review gate**

Run: `npx tsx .pi/skills/implement/scripts/review-changes.ts`

Expected: no unaddressed Critical or Warning finding.

## Self-Review

- Spec coverage: task 1 carries existing `partialHead` metadata and removes zero-cursor false rejection. Task 2 fixes stale anchor latch, reports page effect, retains anchoring, and bounds conversational discovery. Task 3 keeps interactive prompts above virtualized churn. Task 4 verifies unit, quality, live behavior, and review.
- Placeholder scan: no task contains deferred behavior; each production step supplies required fields and conditions.
- Type consistency: `ReplayWindowFrame.partialHead`, `ReplayWindow.partialHead`, and `ReplayWindowMetadata.partialHead` use `boolean | null` at wire/merge boundary and `boolean` after merge. `activeInteractiveRequest` feeds existing `InteractiveUiCard`.
