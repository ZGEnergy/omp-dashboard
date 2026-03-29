## Context

Session cards pulse with a subtle amber tint (`card-working-pulse`) when streaming or resuming. The `currentTool` field on `DashboardSession` holds the active tool name (e.g., `"Read"`, `"Bash"`, `"ask_user"`). When `ask_user` is active, the card looks identical to any other tool execution — there's no visual signal that human attention is needed.

## Goals / Non-Goals

**Goals:**
- Visually distinguish "waiting for input" (`ask_user`) from "processing" on the session card
- Use a different pulsating card color so it's obvious at a glance
- Keep the change minimal — CSS + one condition in the card component

**Non-Goals:**
- Changing the chat view or interactive dialog rendering
- Adding new fields to the protocol or `DashboardSession` type
- Sound or browser notifications for pending input

## Decisions

### 1. Detect ask_user via `currentTool`

Check `session.currentTool === "ask_user"` directly in the card component. No new state or protocol fields needed — the existing `currentTool` field already carries this information.

**Alternative considered:** Track `interactiveRequests` from `SessionState` and pass a `hasPendingInteraction` prop. Rejected — more plumbing for the same result, and `currentTool` is already on `DashboardSession`.

### 2. New CSS class `card-input-pulse` with purple tint

Add a `card-input-pulse` keyframe animation in `index.css` alongside the existing `card-working-pulse`. Uses a purple/violet tint (`rgba(168, 85, 247, 0.08)`) to contrast with the amber working pulse.

**Alternative considered:** Blue tint. Rejected — blue is already used for the selected card border, would be confusing.

### 3. Card class selection logic

The card `<li>` currently applies `card-working-pulse` when `session.status === "streaming" || session.resuming`. The new logic:
- If `currentTool === "ask_user"` → apply `card-input-pulse` (purple)
- Else if streaming or resuming → apply `card-working-pulse` (amber)
- Otherwise → no pulse

Extract a helper function `getCardPulseClass(session)` to keep the className expression clean.

### 4. ActivityIndicator text

When `currentTool === "ask_user"`, show "Waiting for input" in purple instead of "⚡ ask_user" in yellow. Uses a chat/question icon instead of the flash icon.

## Risks / Trade-offs

- [Risk] `ask_user` tool name could change → Mitigation: It's defined in the project's own `.pi/extensions/ask-user.ts`, unlikely to change. Easy to update if it does.
- [Trade-off] Only detects `ask_user` tool, not other potential input-waiting states → Acceptable for now, can extend later.
