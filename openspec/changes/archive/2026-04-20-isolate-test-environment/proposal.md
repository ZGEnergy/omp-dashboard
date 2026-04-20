## Why

Running `npm test` currently mutates the developer's live environment. Integration tests in `packages/server/src/__tests__/` call `createServer()` without overriding `process.env.HOME`, which causes:

1. **Real `~/.pi/agent/sessions/` is scanned** on every server-bootstrap test — `scanAllSessions()` reads every `.meta.json` sidecar.
2. **Real `.meta.json` sidecars are rewritten** via `sessionManager.onChange` → `metaPersistence.save()`, so tests that register/unregister sessions can corrupt state for real sessions sharing the same ID or directory.
3. **Real `~/.pi/dashboard/` files** (`preferences.json`, `known-servers.json`, `config.json`) are touched by tests that spin up full servers.

The user observed: **tests killed an active pi session** during an `npm test` run. The bridge extension on the live dashboard shares `~/.pi/agent/sessions/` with the test-spawned server. When a test fires `session_register` / `session_unregister` and the sessionManager writes sidecars, it races against the live bridge's heartbeat writes and evicts real session state.

Additionally, two integration test files currently hard-code the **same ports** (`19090`/`19091` in `health-endpoint.test.ts` and `session-file-dedup.test.ts`), which is a latent flake source if vitest ever parallelizes across files.

## What Changes

Two complementary isolation layers:

**Layer A — Isolated HOME per test run.** A shared setup file mounted via `setupFiles` in every package's `vitest.config.ts` overrides `process.env.HOME` to a fresh `mkdtempSync` directory, pre-creates `.pi/agent/sessions/` and `.pi/dashboard/`, and removes the directory in `afterAll`. All existing HOME-reading code (`os.homedir()`, `getConfigPath()`, session scanner, meta persistence) transparently honors the override.

**Layer B — Dynamic port helper for integration tests.** A `createTestServer(overrides)` helper that defaults `port: 0` and `piPort: 0` (OS-assigned), awaits `start()`, then returns the resolved port numbers. Eliminates hard-coded `19070`-`19201` ranges and the existing `19090` collision.

Scope boundaries:
- **Includes**: the shared setup file, the test-server helper, wiring in all 4 package vitest configs, migrating the 3 highest-value tests (`smoke-integration`, `health-endpoint`, `session-file-dedup`).
- **Excludes**: migrating the remaining 4 integration tests (they continue to work with hard-coded non-colliding ports); refactoring the ~10 tests that already do manual `HOME` isolation (they keep working, the new setup file is additive); no runtime/CLI changes; no second-dashboard support.

## Capabilities

### New Capabilities
- `test-environment-isolation`: Guarantee that `npm test` never reads from or writes to the developer's real `~/.pi/` directories and never binds to ports that could collide with a running dashboard.

### Modified Capabilities
- None.

## Impact

- **New files**:
  - `packages/shared/src/test-support/setup-home.ts` — global `beforeAll`/`afterAll` HOME override (no external deps; safe to import from any package).
  - `packages/server/src/test-support/test-server.ts` — `createTestServer()` helper returning `{ server, httpPort, piPort, stop }` (lives in `server` because it imports `createServer` — placing it in `shared` would create a `shared → server` dep cycle).
- **Modified files**:
  - `packages/shared/vitest.config.ts`, `packages/server/vitest.config.ts`, `packages/extension/vitest.config.ts`, `packages/client/vitest.config.ts` — add `setupFiles` entry.
  - `packages/server/src/server.ts` — expose resolved `httpPort` / `piPort` on the returned `DashboardServer` (or expose `fastify` + `piGateway` references) so the test helper can read them after `start()`.
  - `packages/server/src/__tests__/smoke-integration.test.ts` — migrate to `createTestServer()`.
  - `packages/server/src/__tests__/health-endpoint.test.ts` — migrate to `createTestServer()`.
  - `packages/server/src/__tests__/session-file-dedup.test.ts` — migrate to `createTestServer()`.
- **No runtime impact**: setup files only run under vitest; production builds are unaffected.
- **No protocol changes, no API changes, no migration needed.**
- **Compatibility**: existing tests that manually override `HOME` continue to work — their `process.env.HOME = testDir` overrides the setup file's default within their own scope.
- **Rollback**: delete `test-support/` and the `setupFiles` lines. Zero production-code touched.
