## Context

When a user clicks "New" to spawn a session, the flow is: browser sends `spawn_session` → server spawns process → server sends `spawn_result` → later, bridge connects and server sends `session_added`. During this gap there is no visual indication in the session list. The current implementation in `App.tsx` tracks `spawnResult` as a single object and shows a toast via `SessionList`. The "New" button is per-group, rendered in `SessionList.tsx` inside each group header.

## Goals / Non-Goals

**Goals:**
- Immediate visual feedback when "New" is clicked (placeholder card with pulse animation)
- Prevent double-spawns per group (disable button while spawning)
- Clean replacement of placeholder with real session card
- Graceful error handling (remove placeholder, show toast)

**Non-Goals:**
- Changing the server-side spawn protocol or adding new message types
- Animating the transition from placeholder to real card (simple swap is sufficient)
- Global spawn locking (each group is independent)

## Decisions

### Decision 1: State shape — `spawningCwds: Set<string>` in App.tsx

Track which cwds have an in-progress spawn as a `Set<string>` in `App.tsx`. This allows per-group independence — spawning in one group doesn't block others.

**Alternative considered**: Single `spawningCwd: string | null` — simpler but prevents parallel spawns across groups. Chose Set for flexibility at minimal complexity cost.

### Decision 2: Clear placeholder on `session_added` for matching cwd

The placeholder is removed when `session_added` arrives with a matching cwd. This ensures the placeholder stays visible until the real card is ready to render.

On `spawn_result` with `success: false`, immediately remove the cwd from `spawningCwds` (placeholder disappears, toast shows error).

On `spawn_result` with `success: true`, do NOT remove — wait for `session_added`.

**Safety timeout**: 30 seconds after spawn request, auto-remove from `spawningCwds` if still present to prevent stuck placeholders.

### Decision 3: PlaceholderSessionCard as a simple component

A new `PlaceholderSessionCard.tsx` component renders a skeleton card matching `SessionCard` dimensions. Uses Tailwind's `animate-pulse` on gray bars to indicate loading. Rendered at the top of the group's session list (before real cards) since new sessions sort to top.

### Decision 4: Props threading via SessionList

`App.tsx` passes `spawningCwds` down to `SessionList`. `SessionList` checks if a group's cwd is in the set to:
1. Render `PlaceholderSessionCard` at top of that group
2. Disable the "New" button for that group

## Risks / Trade-offs

- **[Risk] `session_added` never arrives** → 30s timeout auto-clears the placeholder. Toast already shows spawn result.
- **[Risk] Multiple `session_added` for same cwd (existing sessions reconnecting)** → We clear on ANY `session_added` matching the cwd, which is fine — the spawn either succeeded (card appears) or will time out.
- **[Trade-off] No animated transition** → Simple swap keeps implementation minimal. Can add CSS transition later if desired.
