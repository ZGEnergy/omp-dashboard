## 1. Add test-support infrastructure

- [x] 1.1 Create `packages/shared/src/test-support/setup-home.ts` using `beforeAll`/`afterAll` from vitest that mkdtemp a fresh HOME under `os.tmpdir()`, pre-create `.pi/agent/sessions/` and `.pi/dashboard/`, override `process.env.HOME`, and clean up in afterAll (with `startsWith(os.tmpdir())` safety guard)
- [x] 1.2 Expose resolved ports on `DashboardServer`: add `httpPort()` and `piPort()` getters to the interface and the returned object in `packages/server/src/server.ts`; add `address()` to the `PiGateway` interface in `packages/server/src/pi-gateway.ts` so the port can be read after `start()`
- [x] 1.3 Create `packages/server/src/test-support/test-server.ts` exporting `createTestServer(overrides)` that calls `createServer(...)`, awaits `start()`, reads resolved ports from the new getters, and returns `{ server, httpPort, piPort, stop }`. Subpath imports resolve via existing wildcard exports in both packages' `package.json` — no package.json edits needed.

## 2. Process-level HOME isolation + globalSetup tripwire

**Why the redesign**: a first attempt using `setupFiles` left a race window — modules imported by test files can execute destructive code (`headlessPidRegistry.cleanupOrphans()` via `createServer().start()`) against real `$HOME` before `beforeAll` runs. Worse, if the setup file fails to load or tests are interrupted, isolation silently doesn't apply. Direct evidence: 2 real `~/.pi/agent/sessions/*.meta.json` files were mutated during an interrupted test run even with `setupFiles` configured.

- [x] 2.1 Root `package.json` `test` and `test:watch` scripts prepend `HOME=$(mktemp -d -t pi-test-XXXXXX)` so vitest's process has an isolated HOME from birth.
- [x] 2.2 Converted `packages/shared/src/test-support/setup-home.ts` into a vitest `globalSetup` module (default export) that runs ONCE at vitest boot: tripwire throws if `HOME === os.userInfo().homedir` or HOME is empty; warns if HOME is outside `os.tmpdir()`; pre-creates `.pi/agent/sessions/` and `.pi/dashboard/`; logs effective HOME.
- [x] 2.3 Wired `globalSetup: ["@blackbelt-technology/pi-dashboard-shared/test-support/setup-home.ts"]` into all 4 vitest configs (shared, server, extension, client) in place of the earlier `setupFiles` approach.
- [x] 2.4 Defense-in-depth: added `packages/server/src/test-env-guard.ts` with `isUnsafeTestHomeScan()`. `headlessPidRegistry.cleanupOrphans()` + `killAll()` and `editorPidRegistry.cleanupOrphans()` now no-op (with `console.warn`) when running under vitest against real HOME.
- [x] 2.5 Ran full `npm test` with all isolation layers active: 2110 tests pass, 38 pre-existing failures (unrelated — QR canvas mocking, scrollIntoView jsdom, config default mismatch; all confirmed to fail on pre-change baseline). Files modified outside the current live session's cwd: **zero**. Live dashboard (pid 44987) survived unchanged.

## 3. Verify port:0 end-to-end

- [x] 3.1 Added `packages/server/src/__tests__/test-server-canary.test.ts` — calls `createTestServer()`, asserts non-zero distinct ports, hits `GET /api/health`, verifies 200. Kept as a permanent regression test rather than throwaway: if `createServer` or `piGateway.start` ever stop propagating resolved ports, this fails loudly in CI.

## 4. Migrate priority tests

- [x] 4.1 Migrated `packages/server/src/__tests__/smoke-integration.test.ts` to use `createTestServer()` — removed `httpPort = 19070` / `piPort = 19071` constants and the manual `createServer` call.
- [x] 4.2 Migrated `packages/server/src/__tests__/health-endpoint.test.ts` to use `createTestServer()`.
- [x] 4.3 Migrated `packages/server/src/__tests__/session-file-dedup.test.ts` to use `createTestServer()` (this was the one that collided with health-endpoint on port 19090).
- [x] 4.4 Ran all three migrated tests + canary together under `HOME=$(mktemp -d) vitest run ...`: 4 files passed, 5 tests passed, no port-in-use errors.

## 5. Verify isolation is real

- [x] 5.1 Before `npm test`: `find ~/.pi/agent/sessions -name '*.meta.json' -exec md5 -q {} \;` produced 323 hashes.
- [x] 5.2 Ran `npm test`.
- [x] 5.3 After: same 323 hashes, diff restricted to 2 files under the current live session's cwd (`pi-agent-dashboard`), which is the live bridge's normal heartbeat writing. Zero files in other session directories touched.
- [x] 5.4 During the run, `curl http://localhost:8000/api/health` on the live dashboard returned 200 throughout; pid unchanged (44987).

## 6. Documentation

- [x] 6.1 Added a "Test Isolation (READ BEFORE RUNNING VITEST)" section to `AGENTS.md` covering: why isolation matters (what `cleanupOrphans`/`killAll` do), the three defense layers, safe/unsafe run commands, `createTestServer()` usage, and a before/after hash-diff verification recipe.
- [x] 6.2 Added Key Files entries for `packages/shared/src/test-support/setup-home.ts`, `packages/server/src/test-env-guard.ts`, and `packages/server/src/test-support/test-server.ts`.
