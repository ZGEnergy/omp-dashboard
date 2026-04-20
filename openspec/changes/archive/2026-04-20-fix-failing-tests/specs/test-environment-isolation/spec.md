## MODIFIED Requirements

### Requirement: Tests run with isolated HOME directory at the process level
The vitest test suite SHALL execute with `process.env.HOME` pointing to an ephemeral directory under the OS temp dir from the moment the vitest process starts, AND the suite SHALL exit with zero failures on a clean run against this isolated HOME. Skipped tests are acceptable when each skip carries an inline `TODO(fix-failing-tests-followup)` comment and is tracked in the relevant change's deferred-work list.

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

#### Scenario: Suite exits green on isolated HOME
- **WHEN** `npm test` is invoked on a working tree at or after this change is merged
- **THEN** vitest SHALL exit with code 0
- **AND** the reported failure count SHALL be 0
- **AND** any `.skip`ped tests SHALL carry an inline `TODO(fix-failing-tests-followup)` comment
