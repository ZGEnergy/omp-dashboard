## ADDED Requirements

### Requirement: Tri-state windowsGitSource setting governs git/bash source

The dashboard config SHALL expose `windowsGitSource: "auto" | "host" |
"bundled"` (default `"auto"`) on `~/.pi/dashboard/config.json`. On
non-Windows hosts the setting SHALL be a no-op. On Windows the setting
SHALL drive PATH augmentation for every child process spawned by the
server (bridge, headless agent, terminal PTYs).

#### Scenario: Default config has windowsGitSource = "auto"

- **WHEN** a fresh `~/.pi/dashboard/config.json` is created
- **THEN** the resolved effective config SHALL include
  `windowsGitSource: "auto"`

#### Scenario: Setting is no-op on macOS

- **WHEN** the server runs on `platform: darwin` with
  `windowsGitSource: "bundled"`
- **THEN** `env.PATH` for spawned children SHALL NOT contain any
  reference to `resources/git/`
- **AND** the active git source SHALL be reported as `host`

#### Scenario: Setting is no-op on Linux

- **WHEN** the server runs on `platform: linux` with any
  `windowsGitSource` value
- **THEN** behaviour SHALL be identical to a server with the key
  omitted

### Requirement: selectGitSource implements the auto/host/bundled truth table

The helper `selectGitSource({ setting, env, fsExists, which })` SHALL on
Windows return `"host"` or `"bundled"` according to:

| setting     | host has git AND bash | result    |
|-------------|------------------------|-----------|
| `"auto"`    | yes                    | `host`    |
| `"auto"`    | no                     | `bundled` |
| `"host"`    | yes                    | `host`    |
| `"host"`    | no                     | `bundled` (with Doctor error surfaced) |
| `"bundled"` | either                 | `bundled` |

#### Scenario: auto with both host tools present prefers host

- **WHEN** `selectGitSource` is called with `setting: "auto"` on win32
  AND both `git.exe` and `bash.exe` are resolvable via `where.exe` on
  the inherited PATH
- **THEN** it SHALL return `"host"`

#### Scenario: auto with host bash missing falls back to bundled

- **WHEN** `setting: "auto"` AND `git.exe` is on host PATH but
  `bash.exe` is not
- **THEN** it SHALL return `"bundled"` (atomicity: both or neither
  come from host; never mix)

#### Scenario: host setting with neither tool present emits Doctor error

- **WHEN** `setting: "host"` AND neither tool is on host PATH
- **THEN** `selectGitSource` SHALL still return `"bundled"` so the
  dashboard remains functional
- **AND** Diagnostics SHALL surface an error row "windowsGitSource is
  set to 'host' but git/bash are not on PATH; using bundled fallback"

#### Scenario: bundled setting always uses bundled

- **WHEN** `setting: "bundled"` on win32
- **THEN** `selectGitSource` SHALL return `"bundled"` regardless of
  what is on host PATH

### Requirement: ensureBundledGitOnPath prepends bundled tools when active

The helper `ensureBundledGitOnPath(env)` SHALL, when `selectGitSource()`
returns `"bundled"`, prepend `resources/git/cmd`, `resources/git/usr/bin`, and
`resources/git/<libdir>/bin` to `env.PATH` (in that order), set
`env.GIT_EXEC_PATH` to `resources/git/<libdir>/libexec/git-core`, and set
`env.SSL_CERT_FILE` to `resources/git/ssl/certs/ca-bundle.crt`. The
helper SHALL be idempotent. `<libdir>` SHALL be resolved per-arch (R1
spike): `mingw64` on win32-x64, `clangarm64` on win32-arm64 — detected
by which directory exists under `resources/git/`, never hardcoded.

#### Scenario: Idempotence

- **WHEN** `ensureBundledGitOnPath` is applied to an env, then applied
  again to the result
- **THEN** the final env SHALL deep-equal the env after a single
  application (no duplicated PATH entries)

#### Scenario: No-op when source is host

- **WHEN** `selectGitSource()` returns `"host"`
- **THEN** `ensureBundledGitOnPath` SHALL leave `env` unchanged

#### Scenario: Runs AFTER ensureWindowsSystemPath in buildSpawnEnv

- **WHEN** `ToolResolver.buildSpawnEnv` augments a spawn env on win32
- **THEN** `ensureBundledGitOnPath` SHALL run after that method's
  existing `ensureWindowsSystemPath` call so bundled-git directories
  land before System32 in PATH precedence (bundled git wins lookups
  when active)

#### Scenario: PTY terminal env receives bundled git

- **WHEN** the terminal-manager spawns a PTY on win32 with
  `selectGitSource()` returning `"bundled"`
- **THEN** the PTY env SHALL include the bundled-git PATH prepends even
  though the PTY path does not flow through
  `ToolResolver.buildSpawnEnv` (wired via a direct
  `ensureBundledGitOnPath` call or `getTerminalEnvHints`)
- **AND** `!`/`!!` bang-prefix commands run in that terminal SHALL
  resolve bundled git/bash

### Requirement: Active git/bash source is observable via API and UI

The server SHALL expose the resolved active source via `/api/health`
(or a dedicated `/api/git-source` endpoint) and reflect it in the
Settings panel "Currently active" readout and in Diagnostics.

#### Scenario: /api/health reports git source on Windows

- **WHEN** `GET /api/health` is called against a Windows server
- **THEN** the response SHALL include a `gitSource` object with
  `{ setting, active: "host" | "bundled", gitPath, gitVersion,
  bashPath, bashVersion }`

#### Scenario: /api/health omits gitSource on non-Windows

- **WHEN** `GET /api/health` is called against a macOS or Linux server
- **THEN** the response SHALL omit the `gitSource` field

#### Scenario: Settings UI hidden on non-Windows

- **WHEN** the Settings panel renders on a `darwin` or `linux` server
- **THEN** the "Git & Bash source" radio group SHALL NOT appear in the
  DOM

#### Scenario: Settings UI shows live active source on Windows

- **WHEN** the Settings panel renders on a Windows server
- **THEN** the "Currently active" readout SHALL display the active
  source name, the resolved path, and the detected version
