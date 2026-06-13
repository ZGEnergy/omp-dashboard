# Tasks — derive OpenSpec artifact status locally

## 1. Pure derivation helper

- [ ] 1.1 Add `deriveArtifactStatus(changeDir, listEntry, probes)` to `packages/shared/src/openspec-poller.ts` returning `{ artifacts: [{id, status}], isComplete }`
- [ ] 1.2 Implement artifact rules: `proposal` (file exists), `tasks` (completedTasks===totalTasks && totalTasks>0), `design` (design evidence probe), `specs` (specs evidence probe)
- [ ] 1.3 Derive `isComplete` = every artifact `done`
- [ ] 1.4 Unit-test `deriveArtifactStatus` with injected probes — no fs mocks (mirror `buildOpenSpecData` test style)

## 2. Wire derivation into the periodic poll

- [ ] 2.1 In `directory-service.ts` `pollOne`, when `force === false`, replace the `semaphore.run(() => runOpenSpecStatus(...))` call with `deriveArtifactStatus(changeDir, listEntry, {design, specs})`
- [ ] 2.2 Keep the per-change mtime gate + TOCTOU stamping unchanged (derivation reads the same files the gate stats)
- [ ] 2.3 Preserve `force === true` path: `refreshOpenSpec` still calls `runOpenSpecStatus` (authoritative)
- [ ] 2.4 Confirm `buildOpenSpecData` consumes derived `statusResults` identically to CLI results (no shape change)

## 3. Parity guard

- [ ] 3.1 Add a test that runs `deriveArtifactStatus` and `runOpenSpecStatus` over the repo's own active changes and asserts artifact-for-artifact equality (skips gracefully if `openspec` CLI absent in CI)

## 4. Config relief

- [ ] 4.1 Bump `DEFAULT_OPENSPEC_POLL.pollIntervalSeconds` 30 → 60 in `packages/shared/src/config.ts`
- [ ] 4.2 Update config reference doc note in `docs/architecture.md` (delegate per docs protocol)

## 5. Verify

- [ ] 5.1 `npm test` green
- [ ] 5.2 Manual: restart server with many changes; confirm `[openspec-poll] slow tick` warnings stop and no `heartbeat timeout` correlation
- [ ] 5.3 Manual: click OpenSpec Refresh → still force-spawns CLI (authoritative)
