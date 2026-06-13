## Why

Session-card ordering grew into two parallel systems that no longer reconcile:

1. **An alive-only persisted order map** (`SessionOrderManager`, `Record<cwd, sessionId[]>`, JSON + in-memory). New sessions prepend; resume moves to front; **alive→ended deliberately *removes* the id**; drag reorders.
2. **A separate, recomputed ended tier** — the client throws away `sessionOrder` for ended cards and sorts them live by `(endedAt ?? startedAt)` desc.

On top sits `clusterByWorkspaceName`, which forces worktree/jj sibling cards adjacent and lets `sortSessionsByOrder` rank only *inside* each cluster. The result is three competing notions of "order" and a latent keying bug:

- The order map is keyed by each session's **raw cwd**, but worktree/jj sessions are **grouped under the parent repo** (`resolveSessionGroupPath`). `insert()` and `moveToFront()` write to the worktree-path key the client never reads, so for worktree/jj sessions those operations are **silent no-ops** — only drag (which sends the group cwd) works.
- "Put a completed session first" and "put a question session first" have **no trigger at all** — `agent_end` and `ask_user` never touch order.
- Ended ordering is not persisted, so a drag within the ended tier never sticks, and "ended → top" is an accident of the `endedAt` sort rather than a stored fact.

This change replaces the three systems with **one persisted flat list per resolved-group-path**, rendered by a **stable status-partition**. Because partition is stable, `moveToFront` lands a card at the top of *its own tier* (active / ended / hidden) with one operation and no tier-aware branching.

## What Changes

- **CHANGED (prerequisite fix)**: server keys the order map by `resolveSessionGroupPath(session)` (pin > `jjState.workspaceRoot` > `gitWorktree.mainPath` > `cwd`) — the *same* resolver the client grouping uses — on every `insert` / `moveToFront` / `remove`. Fixes the worktree/jj no-op bug; all four code paths now agree on the key.
- **CHANGED**: the order map holds **all** session ids (alive + ended + hidden), not alive-only. `alive→ended` stops calling `remove()`; ids stay in the list and the render partition re-tiers them by status.
- **CHANGED**: the client renders each folder by a **stable status-partition** of the flat order into ACTIVE → ENDED → HIDDEN tiers, preserving stored relative order within each tier. The `endedAt`-desc ended-tier sort is removed (kept only as a one-time migration seed).
- **CHANGED (reversal)**: `clusterByWorkspaceName` is **dropped from the ordering path**. Worktree/jj sessions no longer force-cluster; the flat order + status-partition is the sole order within a folder. "First" = first of the whole folder. Explicitly reverses Decision 15 of `add-jj-workspace-plugin` and its worktree extension.
- **NEW**: status-transition placement, gated by two settings:
  - `agent_end` on an **alive** session (turn done, still idle) → `moveToFront` (top of active) iff **"Put completed session first"**.
  - `ask_user` request on an **alive** session → `moveToFront` (top of active) iff **"Put question session first"**.
  - `alive→ended` → `moveToFront` (top of ended) iff **"Put completed session first"**.
  - Gate OFF → **no-op**: the card keeps its slot; partition alone re-tiers it.
- **NEW**: hidden cards enter the order map with their own tier. **Hide** → `moveToFront` (top of hidden). **Unhide** → clear `hidden` + `moveToFront` (lands top of ended).
- **NEW**: two global config booleans `completedFirst`, `questionFirst` in `shared/config.ts` (beside `reattachPlacement`) + Settings UI toggles.
- **NEW**: one-time migration — backfill ended ids absent from the persisted map by `endedAt` desc, so existing installs don't show a scrambled ended tier on first load.

Unchanged: new-session prepend, fork-after-parent, resume intent contract (`front`/`keep`/`null`), `reattachPlacement` policy, drag-to-resume `keep`, `sessions_reordered` broadcast, stale-id pruning. These compose on top; drag-to-resume `keep` and registry `front` intents continue to win over the new auto-move triggers.

## Capabilities

### Modified Capabilities

- `session-ordering`: order map keyed by resolved group path; holds all-status ids; status-partition render; new gated status-transition placement; hide/unhide placement; two settings; migration backfill. Removes the `endedAt`-desc ended-tier requirement.
- `session-grouping`: removes the worktree/jj cluster-adjacency ordering requirement (grouping-under-parent stays; cluster ordering goes).

## Impact

- `packages/server/src/session-order-manager.ts` — no API change; callers now pass resolved group path.
- `packages/server/src/server.ts` — `onChange`: `alive→ended` calls `moveToFront` (gated) instead of `remove`; new `agent_end`/`ask_user` alive triggers; startup reconcile stops stripping ended ids + runs backfill.
- `packages/server/src/event-wiring.ts` — `insert` keyed by resolved group path; `agent_end` and `ask_user`/interactive-request arms call placement.
- `packages/server/src/browser-handlers/session-meta-handler.ts` — hide/unhide call `moveToFront` on the resolved key.
- `packages/server/src/reattach-placement.ts` — key by resolved group path.
- `packages/shared/src/config.ts` — add `completedFirst`, `questionFirst` booleans + parse/defaults.
- `packages/client/src/lib/session-grouping.ts` — `sortSessionsByOrder` becomes status-partition-aware; drop `clusterByWorkspaceName` from the ordering path.
- `packages/client/src/components/SessionList.tsx` — ended tier rendered from stored partition, not `endedAt` sort.
- `packages/client/src/components/SettingsPanel.tsx` — two toggles.
- `docs/file-index-*.md`, `docs/architecture.md` — update ordering description + reversal note.

Rollback / safety:

- The keying fix is behaviorally invisible for non-worktree/jj folders (resolved path == cwd).
- Settings default OFF preserves "keep the order" semantics for completed/question; only the always-on rules (new-session, resume-front, hide/unhide) change tier placement unconditionally.
- Migration backfill is one-time and idempotent (only seeds ended ids missing from the map).
- `sessions_reordered` / `sessions_snapshot` already carry the full list and the client replaces (not merges), so all-status membership flows without protocol change.
