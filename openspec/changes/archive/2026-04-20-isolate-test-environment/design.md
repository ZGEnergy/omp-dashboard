## Context

The vitest suite runs 150+ test files across 4 packages (`shared`, `server`, `extension`, `client`). The `server` package contains ~10 integration tests that call `createServer()` to boot a real Fastify + WebSocket gateway inside the test process. These tests were written at different times with different isolation strategies:

- Some tests override `process.env.HOME` in `beforeAll` (e.g. `config-api.test.ts`, `known-servers-routes.test.ts`, `bridge-register-nondestructive.test.ts`).
- Most integration tests (`smoke-integration`, `health-endpoint`, `shutdown-endpoint`, `session-api`, `spa-fallback`, `session-file-dedup`, `auto-shutdown`) do **not** override HOME.
- All currently hard-code TCP ports in the `19070`-`19201` range, with one duplicate (`19090`/`19091` in `health-endpoint` and `session-file-dedup`).

`createServer()` unconditionally calls `scanAllSessions()`, which reads `os.homedir() + "/.pi/agent/sessions/"` and loads every `.meta.json` sidecar. It also registers `sessionManager.onChange` → `metaPersistence.save()`, which writes sidecars back to the same directory. Tests that register sessions therefore mutate the real developer filesystem.

## Goals / Non-Goals

**Goals**
- Zero reads or writes against real `~/.pi/` during any `npm test` invocation.
- Zero test-level port collisions, today and when new integration tests are added.
- No changes to production code paths; isolation is purely a test-support concern.
- Opt-in migration: existing tests keep working unchanged; new tests get safety by default.

**Non-Goals**
- Running multiple live dashboards from the same user account (Layer C from exploration — deferred).
- Refactoring the ~10 tests that already self-isolate HOME.
- Migrating integration tests that currently work and don't share ports (`shutdown-endpoint`, `session-api`, `spa-fallback`, `auto-shutdown`) — follow-up work if desired.
- Providing test helpers for client (jsdom) tests — they don't touch HOME or ports.

## Decisions

### Decision 1: Process-level HOME override + globalSetup tripwire (NOT `setupFiles`)

**Chosen**: Three layers, each independent:

1. **Process-level**: the root `npm test` script prepends `HOME=$(mktemp -d -t pi-test-XXXXXX)` so vitest's process tree starts with an isolated HOME before any TypeScript runs.
2. **Vitest globalSetup**: a module in `packages/shared/src/test-support/setup-home.ts` registered via `test.globalSetup` in every package's vitest.config.ts. Runs ONCE at vitest boot, pre-creates `.pi/agent/sessions/` and `.pi/dashboard/`, and throws if `process.env.HOME === os.userInfo().homedir` (tripwire against regressions to the npm script).
3. **Production-code guards**: `headlessPidRegistry.cleanupOrphans()`, `headlessPidRegistry.killAll()`, and `editorPidRegistry.cleanupOrphans()` no-op (with a console.warn) when `process.env.VITEST === "true"` AND the HOME being read matches the real user home. Defense against any hypothetical future path that bypasses 1 and 2.

**Why not `setupFiles` alone (original plan)**: It left a race window — test files' top-level `import { createServer } from "../server.js"` plus `beforeAll(async () => { server = await createServer(...) })` can trigger `headlessPidRegistry.cleanupOrphans()` **before** the setupFile's `beforeAll` runs, because vitest's `beforeAll` ordering across setupFiles and the test file itself is not strictly defined when async imports are involved. Direct evidence: during implementation testing, 2 real `.meta.json` files in `~/.pi/agent/sessions/` were mutated even with setupFiles wired in.

Worse: if the setup file fails to import (path typo, missing dep, etc.), vitest may silently continue running the suite with real HOME, because setupFile errors don't always abort the run in modes like watch. We need a layer that cannot be bypassed by any in-JS failure.

**Rejected alternatives**:
- **Per-test `beforeAll` override**: fragile — already proved (7 tests don't do it today).
- **Mocking `os.homedir()`**: breaks real libs that read HOME internally.
- **Chroot / jails**: overkill; OS-dependent.
- **`setupFiles` only (original plan)**: proven insufficient — see above.

### Decision 2: `createTestServer()` uses `port: 0`, not a port-allocator

**Chosen**: Pass `port: 0` and `piPort: 0` to `createServer()`. After `await server.start()`, read the actual bound ports from `server.fastify.server.address()` and `piGateway.address()`.

**Rejected alternatives**:
- **Hard-coded non-overlapping ranges**: requires a registry, needs updating for every new test, stale ranges are silent foot-guns.
- **A port-pool library** (`get-port`, etc.): adds a dependency; TOCTOU race between picking a port and binding it; `port: 0` is the OS-authoritative way.

**Constraint**: `createServer()` and `piGateway.start()` must accept `0` and propagate the resolved port. Verify during implementation — if they don't, small API tweak needed.

### Decision 3: Test-support split by dependency footprint

**Chosen**: Place each helper in the lightest-weight package whose dependencies it needs:
- `packages/shared/src/test-support/setup-home.ts` — no deps beyond `node:os`/`node:fs`, lives in shared so every package's vitest config can import it.
- `packages/server/src/test-support/test-server.ts` — depends on `createServer` from `@blackbelt-technology/pi-dashboard-server`, lives in server (only server tests use it anyway).

**Why not all in shared**: `shared` does not depend on `server` in `package.json`, and must not — doing so would create a dep cycle (`server` → `shared` → `server`) and break the monorepo layering. `test-server.ts` must therefore live in a package that already depends on server, or in server itself. Placing it in server is the least-cost option.

**Rejected alternatives**:
- **Both in shared, with shared depending on server**: creates a dep cycle. Rejected.
- **Repo-root `tests/` directory**: not a package, hard to import cleanly; breaks monorepo discipline.
- **Duplicate copies per package**: DRY violation; setup files drift.
- **A new dedicated `@blackbelt-technology/pi-dashboard-test-support` package**: overkill for ~80 LOC; adds publish-pipeline cost.

### Decision 4: `rm -rf` safety guard

The teardown does `rmSync(tmpHome, { recursive: true, force: true })` only after asserting `tmpHome.startsWith(os.tmpdir())`. Defense-in-depth against future refactors that might pass a non-tmp path.

### Decision 5: Don't break tests that already override HOME

Tests like `config-api.test.ts` set `process.env.HOME = testDir` in their own `beforeAll`. That still works — their assignment shadows the setup file's default within the test's scope, and their `afterAll` restores the original `origHome` (which by that point is the setup file's tmp dir, not the real HOME). Net effect: the setup file wraps an extra layer of safety around existing isolation without disrupting it.

## Open Questions

### Does `createServer()` accept `port: 0` today?

Looking at `packages/server/src/server.ts:588` — `fastify.listen({ port: config.port, host: "0.0.0.0" })` does support port `0` (fastify forwards to Node's `net.Server.listen`). `piGateway.start(config.piPort)` needs verification; if it uses a raw `new WebSocketServer({ port })`, `ws` also supports port `0`. `auto-shutdown.test.ts` already passes `port: 0`, which suggests it works end-to-end.

**Verification step in tasks.md**: start with `createTestServer({})` and assert non-zero resolved ports.

### What about tests that don't call `createServer()` but still touch HOME?

The setup file's HOME override applies **to every test file**, regardless of whether it calls `createServer()`. So unit tests that accidentally call `os.homedir()` (e.g. via a helper that reads config) also get isolated. This is a free bonus — no downside because tests that need to read real files already override HOME themselves.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `setupFiles` runs for client (jsdom) tests too — might surprise client code reading `process.env.HOME` | Client code doesn't read HOME; verified by grep. If it ever did, tests would start failing loudly, not silently. |
| A future lib caches `os.homedir()` at module-load time before `beforeAll` runs | Unlikely in our deps; if it happened, we'd add an env-var to the setup file early (before dynamic imports). For now, accept the risk. |
| `port: 0` returns ports above 32768 — could conflict with ephemeral connections | OS guarantees the port is free at bind time; ephemeral-range conflicts are not a real concern. |
| Tests that rely on a specific port (if any) break | Grep confirms none do — all use their own constants. |

## Migration Plan

1. **Phase 1 — add isolation infrastructure (no test migrations)**
   - Create `test-support/` files.
   - Wire `setupFiles` in all 4 vitest configs.
   - Run full test suite — expect **everything still passes** (setup file is transparent).

2. **Phase 2 — migrate the 3 priority tests to `createTestServer()`**
   - `smoke-integration.test.ts`, `health-endpoint.test.ts`, `session-file-dedup.test.ts`.
   - Run those three files individually, then together — verify no port collisions.

3. **Phase 3 — document pattern in AGENTS.md**
   - Add a "Writing integration tests" section pointing at `createTestServer()`.
   - Add the `test-support` import example.

Rollback at any phase is a straight revert; no state to unwind.
