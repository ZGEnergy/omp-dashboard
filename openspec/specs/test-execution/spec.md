## ADDED Requirements

### Requirement: Install test
The system SHALL verify that `npm install -g @blackbelt-technology/pi-dashboard` succeeds on a clean VM, including native module compilation (node-pty).

#### Scenario: Successful npm install on Linux
- **WHEN** the install test runs on a Linux VM
- **THEN** `npm install -g @blackbelt-technology/pi-dashboard` exits with code 0 and `pi-dashboard --version` returns a version string

#### Scenario: Successful npm install on Windows
- **WHEN** the install test runs on a Windows VM
- **THEN** `npm install -g @blackbelt-technology/pi-dashboard` exits with code 0 and node-pty compiles against ConPTY

#### Scenario: Successful npm install on macOS
- **WHEN** the install test runs on a macOS VM
- **THEN** `npm install -g @blackbelt-technology/pi-dashboard` exits with code 0

### Requirement: Server start test
The system SHALL verify that `pi-dashboard start` launches the server and the health endpoint responds.

#### Scenario: Server starts and responds
- **WHEN** the server start test runs
- **THEN** `pi-dashboard start` succeeds, and `curl http://localhost:8000/api/health` returns HTTP 200 within 10 seconds

### Requirement: WebSocket connection test
The system SHALL verify that WebSocket connections can be established to both the pi gateway (port 9999) and browser gateway.

#### Scenario: WebSocket connects
- **WHEN** the WebSocket test runs
- **THEN** a WebSocket client connects to `ws://localhost:9999` and to the browser WS endpoint without error

### Requirement: Terminal spawning test
The system SHALL verify that PTY-based terminal spawning works on each platform.

#### Scenario: Terminal spawns on Linux/macOS
- **WHEN** the terminal test runs on Linux or macOS
- **THEN** a terminal session is created via the API and shell output is received

#### Scenario: Terminal spawns on Windows
- **WHEN** the terminal test runs on Windows
- **THEN** a terminal session is created using ConPTY and PowerShell output is received

### Requirement: Git operations test
The system SHALL verify that server-side git operations (branch listing, init) work on each platform.

#### Scenario: Git operations succeed
- **WHEN** the git test runs in a directory with a git repo
- **THEN** the branch list API returns at least one branch

### Requirement: Test runner with results
The system SHALL provide a `run-all.sh` script that executes all tests in order, collects pass/fail results, and outputs a summary.

#### Scenario: All tests pass
- **WHEN** `run-all.sh` executes and all tests pass
- **THEN** the script outputs a summary showing all tests as PASS and exits with code 0

#### Scenario: Some tests fail
- **WHEN** `run-all.sh` executes and some tests fail
- **THEN** the script outputs a summary showing which tests failed and exits with a non-zero code

### Requirement: Cross-platform test compatibility
The system SHALL use bash scripts for Linux/macOS tests and PowerShell scripts for Windows tests, with a shared test protocol (exit codes, output format).

#### Scenario: Windows tests use PowerShell
- **WHEN** tests execute on a Windows VM
- **THEN** the test runner invokes `.ps1` scripts via PowerShell over SSH

#### Scenario: Unix tests use bash
- **WHEN** tests execute on a Linux or macOS VM
- **THEN** the test runner invokes `.sh` scripts via bash over SSH
