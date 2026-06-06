# Tasks

## 0. Baseline

- [ ] 0.1 Capture current full-run wall time: `npm test 2>&1 | tee /tmp/pi-test-baseline.log`; record total duration + slowest 10 files (`vitest --reporter=verbose` or the run summary).
- [ ] 0.2 Confirm CPU topology on the run host (`node -e 'console.log(require("os").cpus().length)'`) to sanity-check `"50%"`.

## 1. Phase 1 — pure/plugin projects (free win)

- [ ] 1.1 Change `maxWorkers: 1` → `maxWorkers: "50%"` in: `packages/shared`, `packages/extension`, `packages/client-utils`, `packages/dashboard-plugin-runtime`, `packages/flows-plugin`, `packages/flows-anthropic-bridge-plugin`, `packages/jj-plugin`, `packages/honcho-plugin`, `packages/roles-plugin`, `packages/subagents-plugin`, `scripts` vitest configs.
- [ ] 1.2 Run those projects 3× → verify green + no flakes. `npm test` (or per-project) and diff timing vs baseline.

## 2. Phase 2 — client

- [ ] 2.1 (Open question) Confirm jsdom `localStorage` is per-fork in-memory, NOT the global `--localstorage-file`. Document the finding.
- [ ] 2.2 Add `beforeEach`/`afterEach` `localStorage.clear()` to the 6 storage-touching client tests (`InstallBanner`, `MissingRequiredBanner`, `chat-input-draft-integration`, `useSidebarState`, `useTheme`, `draft-storage`) if 2.1 shows it's needed.
- [ ] 2.3 `packages/client/vitest.config.ts`: `maxWorkers: 1` → `"50%"`. Run 3× → green + no flakes.

## 3. Phase 3a — server per-file HOME hook

- [ ] 3.1 Add a per-file setup module (e.g. `packages/shared/src/test-support/setup-home-perfile.ts`): assign `process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-"))`, pre-create `.pi/agent/sessions` + `.pi/dashboard`, and set a per-file `--localstorage-file` path (Decision 3a).
- [ ] 3.2 Wire it via `setupFiles` in `packages/server/vitest.config.ts` (keep existing `globalSetup` tripwire).
- [ ] 3.3 Run server suite (still `maxWorkers: 1`) → verify green; confirms the per-file HOME hook doesn't regress existing behavior.

## 4. Phase 3b — server port migration

- [ ] 4.1 Migrate the 6 collision files to `createTestServer()`/`port: 0`: `last-activity-broadcast`, `auto-attach-slug-defense`, `session-api` (19200); `worktree-base-spawn-flow`, `event-wiring-resume-clear`, `event-wiring-process-classify` (19700). Resolve ports via `httpPort()`/`piPort()` getters.
- [ ] 4.2 Migrate the remaining 12 fixed-port files (see design.md list).
- [ ] 4.3 Add/extend a lint-style guard test asserting no server-boot test uses a hardcoded port (extend `test-server-canary` intent) to prevent regressions.
- [ ] 4.4 Run server suite (still `maxWorkers: 1`) → green after migration.

## 5. Phase 3c — server parallel

- [ ] 5.1 `packages/server/vitest.config.ts`: `maxWorkers: 1` → `"50%"`.
- [ ] 5.2 Run server suite 3× → verify green + no flakes (port collisions + HOME contention resolved).
- [ ] 5.3 If any file is genuinely serial-only, isolate it (`describe.sequential` or per-file override) rather than reverting the whole project.

## 6. Verify + document

- [ ] 6.1 Full `npm test` 3× → all projects green, no flakes; record new wall time vs baseline (0.1).
- [ ] 6.2 Update root `npm test` script if the per-fork localStorage handling moved out of `NODE_OPTIONS`.
- [ ] 6.3 Delegate docs update (per Documentation Update Protocol): note the parallel-test setup + per-file HOME hook in the matching `docs/file-index-<area>.md` split; add `docs/architecture.md` line if the isolation model changed.
