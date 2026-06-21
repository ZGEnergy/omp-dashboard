## Why

Goals shipped in `add-goal-continuation-plugin` (archived 2026-06-14) as a **per-session-card attribute**: the `goal` plugin claims `session-card-badge` (`GoalChip`) + `session-card-action-bar` (`GoalControl`), and the `@ricoyudog/pi-goal-hermes` extension runs the continuation loop **inside one session**. This binds a goal 1:1 to a single card and has three consequences the user hit in practice:

1. **No cross-session view of a goal.** A goal often spans more than one session — the loop session, worktree sessions, and auto-hidden worker sessions (subagents / `memory` tool / nested `pi -p` share the parent cwd and are flagged `hidden`, excluded from auto-navigation in `useMessageHandler.ts`). There is no surface that gathers "every session opened in service of this goal."
2. **The pursuing work is buried.** Goal-driven worker sessions that get auto-hidden cannot be opened/steered without un-hiding them in the sidebar. The user wants them kept hidden in the sidebar **but** openable from one place.
3. **Goal creation/management is scattered across cards** instead of living at the folder level where OpenSpec and Automations already do (`Automations (N) →`, `OpenSpec (N) → Archive Specs` in the folder group).

OpenSpec already proves the target pattern in this codebase: `FolderOpenSpecSection.tsx` is a folder nav slot → `/folder/:encodedCwd/openspec` board route → board cards that link sessions → **"click a session row to open its chat view"** (board footer). Goals should get the same first-class treatment.

## What Changes

- **Goal becomes a folder-scoped entity, not a card attribute.** A `GoalRecord { id, cwd, objective, criteria[], status, budget, sessionIds[], driverSessionId }` persists server-side per folder (cwd-keyed), mirroring `openspec-group-store.ts`. Existing per-session `goal_status` snapshots associate to a goal via `goalId`.
- **New folder nav slot: `Goals (N) →` + `+ Goal`,** sibling of `Automations` / `OpenSpec` in the folder group. `+ Goal` opens a create affordance; `Goals (N) →` opens the goals page.
- **New goals content page** at route `/folder/:encodedCwd/goals` (and `/folder/:encodedCwd/goals/:goalId`), structured like the OpenSpec board: Back · title · Refresh · `+ New Goal`, a status filter bar (All / Pursuing / Paused / Achieved), then goal cards. Each card shows objective, status badge, progress (turns n/m + success criteria), and an expandable **linked-sessions** list.
- **1:N session linking + tracking.** Each goal card lists its linked sessions with `+ New session`, `Link existing…`, and a `⚑ driver` tag on the loop session. Spawning a session from a goal stamps the new session's `goalId`; "Link existing" attaches a running session. This is how "track sessions opened for a specific goal" is delivered.
- **Embedded driver chatview in the goal detail page.** Goal detail reuses the existing ChatView (the same component the OpenSpec board opens on row click) with tabs across linked sessions. The auto-hidden driver/worker sessions **keep their `hidden` flag in the sidebar** (no clutter) but are always openable here — answering "keep hidden sessions, open chatview in goals page."
- **Per-card control demotes to a link chip.** `GoalControl`'s "Set a goal…" input moves to the folder slot / goals page; `GoalChip` on the session card becomes a read-only chip that links to the owning goal.

## Capabilities

### New Capabilities
- `goals-folder-page`: folder-scoped goal records (cwd-keyed store + REST routes), a `Goals (N) → / + Goal` folder nav slot, a goals content page mirroring the OpenSpec board, 1:N session linking (`goalId` stamping + link-existing), and an embedded driver/worker chatview in goal detail.

### Modified Behavior (folded into `goals-folder-page`)
- The shipped `goal` plugin surfaces change: `goal_status` snapshots gain a `goalId` association so per-session status rolls up to a folder goal; `GoalControl` set-input relocates to the folder slot/page; `GoalChip` becomes a link-to-goal chip. The in-session continuation loop (owned by `@ricoyudog/pi-goal-hermes`) is unchanged. (No main spec exists for `pi-dashboard-goal-plugin`, so these are captured as requirements under the new `goals-folder-page` capability rather than a MODIFIED delta.)

## Impact

- **Storage**: new `goal-store.ts` (cwd-keyed `GoalRecord` persistence, mirrors `openspec-group-store.ts`) + `goal-routes.ts` REST surface. Goal↔session link via `goalId` on session `.meta.json`.
- **Client**: new `FolderGoalsSection.tsx` (nav slot), new goals board + detail overlay routes in `App.tsx` (mirror the `openspecBoardOverlay` pattern), goal plugin client demoted to link chip.
- **Reuse, not rebuild**: embedded chatview reuses existing ChatView; board shell reuses OpenSpec-board layout conventions; hidden-session mechanism unchanged (driver stays `hidden` in sidebar).
- **Out of scope (v1)**: changing the `pi-goal-hermes` judge/loop/budget engine; multi-folder/global goals (folder-scoped only); auto-spawning worker sessions on goal start (linking is explicit via `+ New session` / `Link existing`).
- **Architectural fork resolved in design.md**: dashboard owns the `GoalRecord` (source of truth for objective + linked sessions); the extension remains source of truth for live loop state (turns/verdict/paused), surfaced via the existing `goal_status` snapshot and associated by `goalId`.
- **Open dependency**: whether the folder nav slot + content page ship as a new plugin `folder-section` / `content-view` claim (plugin-local, team-preferred) or as a small core addition — decided in design.md.
