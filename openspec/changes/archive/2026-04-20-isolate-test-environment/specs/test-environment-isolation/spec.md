## ADDED Requirements

### Requirement: Tests run with isolated HOME directory at the process level
The vitest test suite SHALL execute with `process.env.HOME` pointing to an ephemeral directory under the OS temp dir from the moment the vitest process starts. Isolation SHALL NOT depend on in-JS hooks that could run after destructive module-level code.

#### Scenario: npm test script sets HOME before vitest starts
- **WHEN** `npm test` (or any script that runs vitest) is invoked
- **THEN** the shell SHALL set `HOME` to `$(mktemp -d -t pi-test-XXXXXX)` for the vitest process before vitest begins execution
- **AND** this override SHALL be in place before any TypeScript module is loaded

#### Scenario: globalSetup acts as a tripwire
- **WHEN** vitest begins a run
- **THEN** the globalSetup module SHALL assert `process.env.HOME !== os.userInfo().homedir`
- **AND** SHALL throw an error that aborts the entire run if the assertion fails
- **AND** the error message SHALL clearly instruct the developer how to run tests safely (`HOME=$(mktemp -d) vitest` or `npm test`)

#### Scenario: globalSetup creates expected .pi subdirectories
- **WHEN** globalSetup runs successfully
- **THEN** it SHALL create `<HOME>/.pi/agent/sessions/` and `<HOME>/.pi/dashboard/`
- **AND** production code that reads these paths SHALL find empty but well-formed directories

#### Scenario: Existing tests that override HOME continue to work
- **WHEN** a test file's own `beforeAll` sets `process.env.HOME = someOtherTmpDir`
- **THEN** that override SHALL shadow the process-level HOME within that test file's scope without error

#### Scenario: Real ~/.pi/ is never touched during test runs
- **WHEN** `npm test` completes (successfully or with failures)
- **THEN** the hashes of every file in the developer's real `~/.pi/agent/sessions/` SHALL be identical to before the run
- **AND** the contents of the real `~/.pi/dashboard/` SHALL be identical to before the run

### Requirement: Destructive production-code sweeps are neutered in test environments
Server startup sweeps that send signals to processes or delete files based on on-disk PID registries SHALL refuse to run destructive actions when the process appears to be a vitest run AND the HOME points to the developer's real home directory. This is defense-in-depth against any path that bypasses the npm script and globalSetup.

#### Scenario: headlessPidRegistry.cleanupOrphans is safe under vitest
- **WHEN** `cleanupOrphans()` is called
- **AND** `process.env.VITEST === "true"`
- **AND** `os.homedir() === os.userInfo().homedir` (real user HOME)
- **THEN** the function SHALL emit a `console.warn` naming the risk
- **AND** SHALL return without reading the registry, signaling any PID, or deleting any file

#### Scenario: headlessPidRegistry.killAll is safe under vitest
- **WHEN** `killAll()` is called under the same conditions as the previous scenario
- **THEN** the function SHALL warn and return without signaling any PID

#### Scenario: editorPidRegistry.cleanupOrphans is safe under vitest
- **WHEN** `cleanupOrphans()` is called under the same conditions as the headlessPidRegistry scenarios
- **THEN** the function SHALL warn and return without signaling any code-server PID or deleting the registry file

### Requirement: Integration tests use OS-assigned ports
Integration tests that boot a real dashboard server SHALL bind to OS-assigned ports (`port: 0`), not hard-coded port numbers, to prevent collisions with running dashboards and between concurrent test files.

#### Scenario: createTestServer returns resolved ports
- **WHEN** a test calls `createTestServer(overrides)` from the shared test-support module
- **THEN** the helper SHALL invoke `createServer({ port: 0, piPort: 0, ...safeDefaults, ...overrides })`
- **AND** after `server.start()` returns, the helper SHALL resolve the actual bound ports from the server's address info
- **AND** return `{ server, httpPort, piPort, stop }` where `httpPort > 0`, `piPort > 0`, and `httpPort !== piPort`

#### Scenario: Port collisions between integration test files are eliminated
- **WHEN** any two integration test files are executed in the same vitest run
- **AND** both use `createTestServer()`
- **THEN** neither shall receive `EADDRINUSE` errors from the Fastify HTTP server or the pi WebSocket gateway

#### Scenario: Live dashboard is unaffected during test runs
- **WHEN** a developer has a live dashboard running on port 8000 with pi gateway on port 9999
- **AND** they run `npm test` concurrently
- **THEN** no test SHALL bind to port 8000 or port 9999
- **AND** the live dashboard's HTTP and WebSocket endpoints SHALL remain responsive throughout the test run

### Requirement: Test-support modules are first-class exports of their owning packages
The test-support helpers SHALL be exported as stable subpath exports from the lightest-weight package whose dependencies they need, preserving the monorepo's dependency layering (`server → shared`, never the reverse).

#### Scenario: setup-home is importable from any package's vitest config
- **WHEN** any package's `vitest.config.ts` lists `setupFiles: ["@blackbelt-technology/pi-dashboard-shared/test-support/setup-home"]`
- **THEN** the import SHALL resolve successfully
- **AND** the setup hooks SHALL register without error
- **AND** the shared package SHALL NOT gain a dependency on the server package

#### Scenario: createTestServer is importable from server test files
- **WHEN** a server test file imports `{ createTestServer } from "@blackbelt-technology/pi-dashboard-server/test-support/test-server"`
- **THEN** the import SHALL resolve successfully
- **AND** calling the helper SHALL return a usable `DashboardServer` with resolved non-zero `httpPort` and `piPort`
