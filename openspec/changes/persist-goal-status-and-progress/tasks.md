# Tasks — persist-goal-status-and-progress

## 1. Types
- [ ] 1.1 `GoalRecord` (`packages/shared/src/types.ts`): add optional `lastKnownTurnsUsed?`, `totalTurnsUsed?`, `lastProgressAt?`. → verify: `tsc --noEmit` clean; legacy record type-loads.

## 2. Projection
- [ ] 2.1 In `goal-verdict-accumulator.ts` (or new `goal-status-projector.ts` sharing the store): project each `goal_status` snapshot onto durable `status` (active→pursuing, paused→paused, done→achieved, cleared→cleared), keyed by the session's `goalId`; write only on status change. → verify: unit test mapping + idempotent write + unlinked-session ignored.
- [ ] 2.2 Turn accounting: per-driver baseline + non-negative delta into `totalTurnsUsed`; `lastKnownTurnsUsed` = latest; `lastProgressAt` on strict increase only; first-observed >0 counts as consumed. → verify: unit test two-driver cumulative (0→3 then 0→2 = 5), no-double-count, progress-timestamp-only-on-increase, first-observed-not-lost.

## 3. Store
- [ ] 3.1 `goal-store.ts`: `applyStatus`/projection update under the store mutex; all new fields optional; legacy `GoalsFile` loads unchanged + backfills on first snapshot. → verify: unit test legacy load + backfill.

## 4. Discipline checkpoints
- [ ] 4.1 `doubt-driven-review`: `totalTurnsUsed` is the downstream budget denominator — confirm the baseline/delta accounting cannot under- or double-count.
- [ ] 4.2 `observability-instrumentation`: durable status/turns survive restart; a dropped fire-and-forget write self-heals on the next snapshot.

## 5. Docs
- [ ] 5.1 (delegate to docs subagent, caveman style) update `packages/server/src/AGENTS.md` rows for `goal-verdict-accumulator.ts` (+ new `goal-status-projector.ts` if added) and `goal-store.ts`; `See change: persist-goal-status-and-progress`.

## 6. Verify & ship
- [ ] 6.1 `npm run quality:changed` green (biome + tsc + tests).
- [ ] 6.2 `openspec validate persist-goal-status-and-progress --strict` passes.
- [ ] 6.3 Manual: pursue a goal to achieved, restart the server, confirm the board still shows `achieved` + correct turn totals.
