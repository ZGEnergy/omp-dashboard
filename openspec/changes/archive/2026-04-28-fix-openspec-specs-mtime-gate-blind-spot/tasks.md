## 1. New shared module: `openspec-specs-evidence.ts`

- [x] 1.1 Create `packages/shared/src/openspec-specs-evidence.ts` exporting `SpecsEvidenceProbe` (interface with `hasAnySpecFile(): boolean`), `evaluateLocalSpecsSatisfaction(changeDir, probe)` (pure rule evaluator returning boolean), and `createFsSpecsEvidenceProbe()` (real-fs probe factory using `fs.existsSync` + recursive readdir or fast-glob, ENOENT-safe via try/catch — mirror the structure of `openspec-design-evidence.ts`)
- [x] 1.2 Add `packages/shared/src/__tests__/openspec-specs-evidence.test.ts` with cases: (a) `specs/<cap>/spec.md` exists → true, (b) empty `specs/` directory → false, (c) `specs/` does not exist → false (no throw), (d) `specs/<cap>/sub/file.md` (deep) → true, (e) `specs/cap.md` (flat sibling) → true, (f) symlink to a `.md` outside specs → false (only files inside the change tree count), (g) probe never throws on permission errors
- [x] 1.3 Verify test isolation: each test creates its own tmp `<change>` directory, cleans up after, no shared global state

## 2. Wire specs probe into the poller

- [x] 2.1 In `packages/shared/src/openspec-poller.ts`, declare `SpecsProbeFactory = (changeName: string) => SpecsEvidenceProbe` and extend `buildOpenSpecData(listResult, statusResults, designProbeFactory?, specsProbeFactory?): OpenSpecData` to accept the new optional parameter
- [x] 2.2 Inside the per-change loop in `buildOpenSpecData`, after the existing design override block, add a parallel block that finds `artifacts[specs]`, gates on `status === "ready"`, calls `evaluateLocalSpecsSatisfaction`, and promotes to `"done"` on true (mirror the design block exactly, including the post-override `isComplete` re-derivation that already exists)
- [x] 2.3 Add `createFsSpecsProbeFactory(cwd: string): SpecsProbeFactory` next to the existing `createFsProbeFactory` — closes over `path.join(cwd, "openspec", "changes")` and returns a per-change probe rooted at `<changesRoot>/<name>/specs/`
- [x] 2.4 Wire the new factory at both production call sites: `pollOpenSpec` (sync) and `pollOpenSpecAsync` (async). Pass `createFsSpecsProbeFactory(cwd)` as the new fourth argument
- [x] 2.5 Update `packages/shared/src/__tests__/openspec-poller.test.ts` (or the equivalent file): add cases asserting the override promotes `ready → done` when the injected factory's probe returns `true`, leaves `done` alone, leaves `blocked` alone, and is a verbatim no-op when no factory is passed (back-compat)

## 3. Extend the mtime watch set in `directory-service.ts`

- [x] 3.1 In `packages/server/src/directory-service.ts`, modify `perChangeArtifactPaths(changesRoot, name): string[]` to additionally enumerate `<change>/specs/` and every immediate child directory + `spec.md` inside. Use `fs.readdirSync(specsDir, { withFileTypes: true })` filtered to `entry.isDirectory()`. Wrap in `try`/`catch` returning `[]` on `ENOENT`/permission errors
- [x] 3.2 Confirm the function still returns ENOENT-safe paths (the existing `effectiveMtimeOr` walker handles missing entries gracefully — verify by adding a test case where a change has no `specs/` directory)
- [x] 3.3 Wire `createFsSpecsProbeFactory(cwd)` at the gated path in `directory-service.ts` (the same site that currently passes `createFsProbeFactory(cwd)` for the design override) so the override fires equally on the gated and the direct-poll paths

## 4. Regression test for the gated cache invalidation timeline

- [x] 4.1 In `packages/server/src/__tests__/directory-service.test.ts`, add a test `"specs file creation invalidates per-change cache"` that:
  - sets up a tmp cwd with `openspec/changes/foo/{proposal.md,design.md,tasks.md}` and an empty `specs/` (or no `specs/` at all)
  - mocks/stubs `runOpenSpecList` and `runOpenSpecStatus` to return controlled artifact arrays
  - runs the gated poll once → asserts the cache stamps `specs: ready`
  - simulates `mkdir specs/cap` + `write specs/cap/spec.md` (real fs ops)
  - runs the gated poll again → asserts `runOpenSpecStatus` is invoked exactly once and the new cache reflects `specs: done`
- [x] 4.2 Add a companion test `"in-place edit to spec.md invalidates per-change cache"` that authors `specs/cap/spec.md`, polls, edits the same file, polls again, and asserts the second poll invokes `runOpenSpecStatus` again
- [x] 4.3 Add a companion test `"deletion of specs/cap invalidates per-change cache"` mirroring 4.2 but with `rm -rf specs/cap`
- [x] 4.4 Run `npm test 2>&1 | tee /tmp/pi-test.log` and grep for `FAIL`. All directory-service and openspec-poller tests MUST pass

## 5. Verify against live repro

- [x] 5.1 With the dashboard running on `localhost:8000`, restart the server (`pi-dashboard restart`) and confirm via the WebSocket replay that `fix-mobile-header-and-orientation` now reports `specs: done` (S letter green) and the Apply button appears in the session card
- [x] 5.2 Manually re-trigger by deleting and re-creating `specs/<cap>/spec.md` in any active multi-spec change; confirm the dashboard updates within one poll interval (default 5 s)
- [x] 5.3 Confirm no regression: a change with `specs: blocked` (e.g. when `proposal.md` is missing) still shows blocked-state colors and no `done` promotion fires

## 6. Documentation

- [x] 6.1 Update `AGENTS.md` Key Files entry for `packages/server/src/directory-service.ts` to mention the extended watch set, citing this change name in the same `See change: ...` style as prior fixes
- [x] 6.2 Update `AGENTS.md` Key Files entry for `packages/shared/src/openspec-poller.ts` to mention the second probe factory parameter
- [x] 6.3 Add a new `AGENTS.md` Key Files entry for `packages/shared/src/openspec-specs-evidence.ts` describing the rule evaluator + factory, parallel to the existing `openspec-design-evidence.ts` entry
- [x] 6.4 Update `docs/architecture.md` if it mentions the per-change watch set explicitly (grep for `perChangeArtifactPaths` / `tasks.md, proposal.md, design.md` and add `specs/` if present)
