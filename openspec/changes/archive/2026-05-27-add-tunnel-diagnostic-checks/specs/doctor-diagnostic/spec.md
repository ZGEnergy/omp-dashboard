# doctor-diagnostic delta

## MODIFIED Requirements

### Requirement: Section taxonomy on every check
Every `DoctorCheck` SHALL carry a `section` field whose value is one of `runtime`, `pi-tooling`, `server`, `tunnel`, `setup`, or `diagnostics`. The mapping from check name to section SHALL be defined in a single shared table consumed by every renderer.

#### Scenario: Runtime checks are tagged runtime
- **WHEN** the doctor produces checks named `Electron`, `System Node.js`, `Bundled Node.js`, or `Bundled npm`
- **THEN** each of those checks SHALL have `section: "runtime"`

#### Scenario: pi-tooling checks are tagged pi-tooling
- **WHEN** the doctor produces checks named `pi CLI` or `openspec CLI`
- **THEN** each of those checks SHALL have `section: "pi-tooling"`

#### Scenario: Server-related checks are tagged server
- **WHEN** the doctor produces checks named `Dashboard server code`, `Offline packages bundle`, `TypeScript loader (tsx)`, `Dashboard server`, `Server log (~/.pi-dashboard/server.log)`, or `Server launch test`
- **THEN** each of those checks SHALL have `section: "server"`

#### Scenario: Tunnel checks are tagged tunnel
- **WHEN** the doctor produces checks named `zrok binary`, `zrok environment`, `zrok API reachable`, or `tunnel runtime`
- **THEN** each of those checks SHALL have `section: "tunnel"`

#### Scenario: Setup checks are tagged setup
- **WHEN** the doctor produces checks named `Setup wizard` or `API key`
- **THEN** each of those checks SHALL have `section: "setup"`

#### Scenario: Managed-install check is tagged diagnostics
- **WHEN** the doctor produces the `Managed install (~/.pi-dashboard)` check
- **THEN** that check SHALL have `section: "diagnostics"`

### Requirement: Markdown export of the doctor report
The doctor SHALL expose a pure formatter that converts a `DoctorReport` into GitHub-issue-paste-friendly Markdown. The output SHALL contain one Markdown table per non-empty section, a summary header line, and a "Remediation" bullet list enumerating the suggestion of each non-ok check.

#### Scenario: All-ok report renders without remediation list
- **WHEN** every check in the report has `status: "ok"`
- **THEN** the Markdown output SHALL include the per-section tables and summary header
- **AND** the Markdown output SHALL NOT include a "Remediation" section

#### Scenario: Mixed report includes remediation list
- **WHEN** the report contains at least one check with `status: "warning"` or `status: "error"`
- **THEN** the Markdown output SHALL include a "Remediation" bullet list
- **AND** each bullet SHALL pair a check name with its `suggestion` text

#### Scenario: Section ordering is stable
- **WHEN** the formatter renders any report
- **THEN** the section tables SHALL appear in the fixed order: runtime, pi-tooling, server, tunnel, setup, diagnostics
- **AND** within each section, rows SHALL appear in the order the checks were produced by the doctor

### Requirement: Web UI renders the doctor report in Settings → Diagnostics
The dashboard web client SHALL render a Diagnostics section inside the Settings panel that fetches `/api/doctor` and displays one grouped table per section, with a status pill per row, the row's `message`, and the row's `suggestion` when present. The section SHALL include a `Copy as Markdown` action that copies the formatter's Markdown output to the clipboard.

#### Scenario: Diagnostics section renders sections in order
- **WHEN** the user opens Settings → Diagnostics
- **THEN** the section SHALL display tables in the order: runtime, pi-tooling, server, tunnel, setup, diagnostics
- **AND** sections that have zero checks in the response SHALL not be rendered

#### Scenario: Re-run refreshes the report
- **WHEN** the user clicks `[Re-run]`
- **THEN** the client SHALL re-issue `GET /api/doctor` and re-render the result with the new `generatedAt`

#### Scenario: Copy as Markdown writes to clipboard
- **WHEN** the user clicks `[Copy as Markdown]` on the Diagnostics section
- **THEN** the client SHALL write the Markdown rendering of the current report to the system clipboard

## ADDED Requirements

### Requirement: Tunnel diagnostic checks
The doctor SHALL produce four `tunnel`-section checks covering the failure modes of zrok-based public tunneling: `zrok binary`, `zrok environment`, `zrok API reachable`, and `tunnel runtime`. The first three SHALL run independently of any active tunnel; the fourth SHALL consume the existing tunnel-watchdog status and SHALL gracefully degrade to `ok` when watchdog data is unavailable. All four SHALL accept test-seam injection so tests do not perform real DNS lookups, filesystem reads, or binary lookups.

#### Scenario: zrok binary not found
- **WHEN** the resolver cannot locate a `zrok` binary on the system
- **THEN** the `zrok binary` check SHALL have `status: "warning"`
- **AND** the `suggestion` SHALL include an OS-appropriate install command (e.g. `brew install zrok` on macOS, the upstream download URL elsewhere)

#### Scenario: zrok binary found
- **WHEN** the resolver locates a `zrok` binary
- **THEN** the `zrok binary` check SHALL have `status: "ok"`
- **AND** the `detail` SHALL include the resolved absolute path

#### Scenario: zrok environment file present and valid
- **WHEN** `~/.zrok2/environment.json` or `~/.zrok/environment.json` exists and contains valid JSON with a non-empty `zrok_token`
- **THEN** the `zrok environment` check SHALL have `status: "ok"`

#### Scenario: zrok environment file missing
- **WHEN** neither `~/.zrok2/environment.json` nor `~/.zrok/environment.json` exists
- **THEN** the `zrok environment` check SHALL have `status: "warning"`
- **AND** the `suggestion` SHALL guide the user to run `zrok invite` followed by `zrok enable <token>`

#### Scenario: zrok environment file malformed
- **WHEN** the environment file exists but contains invalid JSON or is missing `zrok_token`
- **THEN** the `zrok environment` check SHALL have `status: "warning"` and SHALL NOT throw

#### Scenario: zrok API DNS lookup succeeds
- **WHEN** `dns.promises.lookup("api-v1.zrok.io")` resolves within the configured timeout
- **THEN** the `zrok API reachable` check SHALL have `status: "ok"`

#### Scenario: zrok API DNS lookup fails
- **WHEN** the DNS lookup fails with `ENOTFOUND`, `EAI_AGAIN`, or any other network error
- **THEN** the `zrok API reachable` check SHALL have `status: "warning"`
- **AND** the `detail` SHALL include the captured failure reason
- **AND** the `suggestion` SHALL mention checking network connectivity, DNS, and VPN as likely causes

#### Scenario: zrok API DNS lookup times out
- **WHEN** the DNS lookup does not complete within 3000 ms
- **THEN** the `zrok API reachable` check SHALL have `status: "warning"`
- **AND** the `detail` SHALL include the text `timeout 3000 ms`

#### Scenario: Tunnel runtime check with no watchdog data
- **WHEN** the doctor's `getTunnelWatchdogStatus` dependency is undefined OR returns `null`
- **THEN** the `tunnel runtime` check SHALL have `status: "ok"`
- **AND** the `detail` SHALL state that no tunnel is currently active

#### Scenario: Tunnel runtime check with healthy watchdog
- **WHEN** `getTunnelWatchdogStatus()` returns a status with `consecutiveFailures === 0` and `lastSuccessAt` within `intervalMs × 3` of now
- **THEN** the `tunnel runtime` check SHALL have `status: "ok"`
- **AND** the `detail` SHALL include the current tunnel URL and `recycleCount`

#### Scenario: Tunnel runtime check with degraded watchdog
- **WHEN** `getTunnelWatchdogStatus()` returns a status with `consecutiveFailures > 0` OR `lastSuccessAt` older than `intervalMs × 3`
- **THEN** the `tunnel runtime` check SHALL have `status: "warning"`
- **AND** the `detail` SHALL include `lastFailureReason` from the watchdog status
- **AND** the `suggestion` SHALL guide the user to click the 🌐 Tunnel button to re-create the tunnel
