# Design — add-goals-folder-page

Builds on archived `add-goal-continuation-plugin`. That change is the foundation: plugin bridge mirrors `pi-goal-hermes:event` → `goal_status` snapshot; server caches snapshot per session + `broadcastToSubscribers`; client renders chip + control. This change promotes the goal from a per-session snapshot to a folder-scoped record that **owns** sessions and surfaces their chatviews.

## Resolved questions

### Q1 — Storage / source-of-truth fork (the big one)

**Decision: split ownership.**
- **Dashboard owns `GoalRecord`** — the durable definition: objective, success criteria, status intent, budget config, `sessionIds[]`, `driverSessionId`. Persisted cwd-keyed in a new `goal-store.ts`, mirroring `openspec-group-store.ts` (atomic tmp+rename, per-cwd file under the dashboard data dir).
- **Extension owns live loop state** — `@ricoyudog/pi-goal-hermes` stays source of truth for `turnsUsed/maxTurns/lastVerdict/pausedReason`, surfaced via the existing `goal_status` snapshot. The snapshot gains a `goalId` field so the dashboard rolls a session's live state up to its `GoalRecord`.

Rationale: rebuilding the judge/loop in the dashboard contradicts the deliberate plugin-first choice (archive proposal). The dashboard adds the *aggregation + linking + page* layer the extension never had, without owning the loop.

```
GoalRecord (dashboard, durable)        goal_status snapshot (extension, live)
  id, cwd, objective, criteria[]   ◄── goalId association ──►  status, turnsUsed/maxTurns,
  status, budget, sessionIds[],                                 lastVerdict, pausedReason
  driverSessionId                                               (per session, cached server-side)
```

### Q2 — Plugin-local vs core surfaces

**Decision: fully plugin-local — zero core/shell edits.** Verified in `packages/shared/src/dashboard-plugin/slot-props.ts`: every needed slot already exists.
- Folder nav slot (`Goals (N) → / + Goal`) → claim **`sidebar-folder-section`** (carries `FolderDescriptor`; same slot OpenSpec/Automations folder sections use).
- Goals board + goal detail page → claim **`content-view`** (flows-plugin precedent, predicate-driven) routed via **`shell-overlay-route`** at `/folder/:encodedCwd/goals` + `/folder/:encodedCwd/goals/:goalId`.
- Every slot requires `pluginContext: AnyPluginContext` on top of slot-specific props.

### Q3 — Session ↔ goal linking

- **Spawn from goal**: `+ New session` on a goal stamps `goalId` into the new session spawn options → persisted on session `.meta.json` (metaPersistence). Reuses existing spawn correlation (`PI_DASHBOARD_SPAWN_TOKEN`).
- **Link existing**: `Link existing…` adds a running session's id to `GoalRecord.sessionIds[]` (and stamps `goalId` on its meta). Unlink removes it.
- **Driver**: `driverSessionId` = the session running the `pi-goal-hermes` loop (first session with a `goal_status` for this goalId, or explicitly set). Tagged `⚑ driver` in UI.

### Q4 — Hidden driver/worker visibility

- Auto-hidden sessions (subagent / memory / nested `pi -p`, flagged `hidden`) **keep** the flag — sidebar stays clean, auto-navigation suppression in `useMessageHandler.ts` unchanged.
- The goal detail page lists + opens them regardless of `hidden`, reusing ChatView. Tabs switch across `sessionIds[]`. This is the "keep hidden, open chatview in goals page" requirement.

## Data model

```ts
interface GoalRecord {
  id: string;
  cwd: string;                       // folder scope key
  objective: string;
  criteria: { text: string; done: boolean }[];
  status: "pursuing" | "paused" | "achieved" | "cleared";
  budget?: { maxTurns?: number; maxSpendUsd?: number };
  sessionIds: string[];
  driverSessionId?: string;
  createdAt: number; updatedAt: number;
}
```

## REST surface (mirror openspec-group-routes.ts)

```
GET    /api/folders/:cwd/goals                 list GoalRecord[]
POST   /api/folders/:cwd/goals                 create { objective, criteria?, budget? }
PATCH  /api/folders/:cwd/goals/:id             update status/objective/criteria/budget
DELETE /api/folders/:cwd/goals/:id             delete (clears goalId on linked sessions)
POST   /api/folders/:cwd/goals/:id/sessions    link { sessionId } | spawn { spawnOpts }
DELETE /api/folders/:cwd/goals/:id/sessions/:sid  unlink
```
Broadcast `goals_update { cwd, goals }` to browser subscribers on mutation (mirror `openspec_groups_update`).

## Non-goals (v1)

- No change to the judge model, loop cadence, or budget enforcement (extension-owned).
- No global/multi-folder goal aggregation — folder-scoped only.
- No automatic worker spawning on goal start — linking stays explicit.
- Typed `/goal` in chat stays out of scope (as in the archived change).

## Mockups

See `mockups/goals-redesign.html` in this change folder (3 screens: folder nav slot, goals board, goal detail + embedded chatview). Rendered against live dashboard theme tokens.
