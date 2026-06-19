# openspec-profile-config Specification

## Purpose

Read, write, and apply the global OpenSpec workflow profile from the dashboard: global config write (CLI preset for `core`, atomic JSON for `expanded`/`custom`), per-cwd and bulk `openspec update`, and per-cwd staleness reporting. See change: add-openspec-profile-settings.

## Requirements

### Requirement: Write global OpenSpec config from the dashboard

The server SHALL expose `POST /api/openspec/config` (localhost-only, behind the existing network guard) that accepts `{ profile: "core" | "expanded" | "custom", workflows: string[] }` and persists it to the global OpenSpec config file (`~/.config/openspec/config.json`).

- When `profile === "core"`, the server SHALL invoke the CLI preset via the `OPENSPEC_CONFIG_PROFILE` recipe (`openspec config profile core`) rather than writing JSON directly.
- When `profile === "expanded"` or `"custom"`, the server SHALL write the config file directly (no CLI preset exists for these), setting `profile` and `workflows` and preserving all other existing keys (`delivery`, `telemetry`, `featureFlags`).
- For the `expanded` option, the server SHALL write `profile: "expanded"` with the expanded workflow set (`propose, explore, new, continue, ff, apply, verify, sync, archive, bulk-archive, onboard`).
- The `delivery` field SHALL be left unchanged (out of scope).
- After a successful write, the server SHALL invalidate its 30s `configCache` so the next `GET /api/openspec/config` returns fresh data.

#### Scenario: Save core profile uses the CLI preset

- **WHEN** a client POSTs `{ profile: "core", workflows: ["propose","explore","apply","archive"] }`
- **THEN** the server runs `openspec config profile core`
- **AND** returns `{ success: true }`
- **AND** the cached config for affected cwds is invalidated

#### Scenario: Save expanded profile writes JSON with profile "expanded"

- **WHEN** a client POSTs `{ profile: "expanded", workflows: [...11 workflows] }`
- **THEN** the server writes `~/.config/openspec/config.json` with `profile: "expanded"` and the 11-workflow array
- **AND** preserves the existing `delivery`, `telemetry`, and `featureFlags` keys

#### Scenario: Save custom profile writes the selected subset

- **WHEN** a client POSTs `{ profile: "custom", workflows: ["propose","apply","archive"] }`
- **THEN** the server writes `profile: "custom"` with exactly those three workflows

### Requirement: Atomic global config write

When writing `~/.config/openspec/config.json` directly, the server SHALL write to a temporary file in the same directory and `rename()` it over the target, so a concurrent reader (CLI or another tool) never observes a partially written file.

#### Scenario: Write is atomic

- **WHEN** the server writes the global config directly
- **THEN** it writes to a temp file then renames it over `config.json`
- **AND** a reader either sees the complete old file or the complete new file, never a partial one

#### Scenario: Write failure leaves the original intact

- **WHEN** the write to the temp file fails
- **THEN** the original `config.json` is unchanged
- **AND** the endpoint returns `{ success: false, error }`

### Requirement: Run openspec update from the dashboard

The server SHALL expose `POST /api/openspec/update` (localhost-only) that runs the `OPENSPEC_UPDATE` recipe (`openspec update`) in a target working directory.

- The body SHALL accept either `{ cwd: string }` for a single project or `{ all: true }` to update every known cwd (union of active session cwds and pinned directories).
- On a successful update for a cwd, the server SHALL record that cwd's current workflow-set signature so staleness can be computed later.
- A failure updating one cwd in the `all` path SHALL NOT abort the remaining cwds; the response SHALL report per-cwd success/failure.

#### Scenario: Update a single project

- **WHEN** a client POSTs `{ cwd: "/home/user/project" }`
- **THEN** the server runs `openspec update` in that directory
- **AND** records the project's workflow-set signature
- **AND** returns `{ success: true }`

#### Scenario: Update all known projects

- **WHEN** a client POSTs `{ all: true }`
- **THEN** the server runs `openspec update` in every known cwd (session cwds + pinned dirs)
- **AND** returns a per-cwd result list
- **AND** one cwd's failure does not prevent the others from being updated

### Requirement: Report per-cwd update staleness

The server SHALL expose `GET /api/openspec/update-status` that returns, for each known cwd, one of `up-to-date`, `needs-update`, or `unknown`.

- "Known cwds" SHALL be the union of active session cwds and pinned directories, **filtered to OpenSpec-initialized projects only** (a `<cwd>/openspec/` directory exists). Directories where `openspec init` has not run SHALL be excluded from both the status list and the update-all target set.
- A cwd is `up-to-date` when its recorded workflow-set signature equals the current global config's workflow-set signature.
- A cwd is `needs-update` when a recorded signature exists but differs from the current one.
- A cwd is `unknown` when no signature has been recorded (the dashboard has never run an update for it).

#### Scenario: Project matching current config is up-to-date

- **WHEN** a cwd's recorded signature equals the current global workflow-set signature
- **THEN** the status for that cwd is `up-to-date`

#### Scenario: Project lagging the current config needs update

- **WHEN** the global profile changed since a cwd was last updated via the dashboard
- **THEN** the status for that cwd is `needs-update`

#### Scenario: Never-updated project is unknown

- **WHEN** the dashboard has no recorded signature for a cwd
- **THEN** the status for that cwd is `unknown`

#### Scenario: Non-initialized directories are excluded

- **WHEN** a known cwd has no `openspec/` directory (`openspec init` never ran)
- **THEN** that cwd does not appear in the update-status list
- **AND** `POST /api/openspec/update { all: true }` does not run `openspec update` there

### Requirement: Saving the profile does not mutate project repositories

A successful `POST /api/openspec/config` SHALL NOT run `openspec update` and SHALL NOT write any file inside a project working directory. Regenerating per-project `/opsx:` skill files SHALL only occur through the explicit update endpoint.

#### Scenario: Save leaves project working trees clean

- **WHEN** a client saves a new profile via `POST /api/openspec/config`
- **THEN** no file inside any project cwd is created or modified
- **AND** only `~/.config/openspec/config.json` (global) changes

### Requirement: Reading the global OpenSpec config does not block the event loop

`GET /api/openspec/config` SHALL read the global OpenSpec config without blocking the Node event loop. The handler SHALL run `openspec config list` through the asynchronous spawn path (not `spawnSync`), so a cold-cache read (which invokes the `openspec` CLI and can take ~1s) does not stall other in-flight HTTP requests on the single-threaded server.

- The 30s `configCache` behavior SHALL be preserved: a warm read returns the cached value without spawning the CLI.
- A cold read SHALL still return a well-formed `OpenSpecConfig` (defensive defaults for missing fields), the same shape as today.
- `GET /api/openspec/update-status` and the `POST /api/openspec/update` signature-record step SHALL likewise read the global workflow-set signature through the async spawn path. Because the profile is machine-global, the signature is identical for every cwd, so the server SHALL compute it ONCE per request rather than spawning the CLI once per project.

#### Scenario: Cold read does not stall concurrent requests

- **WHEN** a cold-cache `GET /api/openspec/config` triggers an `openspec config list` invocation that takes ~1s
- **THEN** other HTTP requests handled by the server during that interval are not delayed by the CLI invocation
- **AND** the config read still returns the correct profile/workflows once the CLI completes

#### Scenario: Warm read serves from cache without spawning

- **WHEN** `GET /api/openspec/config` is requested within 30s of a prior read for the same resolved cwd
- **THEN** the server returns the cached config
- **AND** does not invoke the `openspec` CLI

#### Scenario: update-status computes the global signature once, not per cwd

- **WHEN** `GET /api/openspec/update-status` runs with N known OpenSpec projects
- **THEN** the server invokes the `openspec` CLI exactly once (async), not once per project
- **AND** the per-cwd staleness classification still uses that single global signature

### Requirement: Profile settings section loads the saved profile reliably

The Settings "OpenSpec Workflow Profile" section SHALL reflect the current global profile/workflows once loaded, and SHALL NOT present a concrete profile as selected before the real config has resolved. A transient load failure SHALL NOT silently strand the section on a hardcoded default.

- On mount, the section SHALL show a loading state (no profile radio pre-selected as authoritative) until the global config resolves.
- On a transient fetch failure, the section SHALL retry the load (at least once) before giving up.
- If the load ultimately fails, the section SHALL surface a visible error with a manual retry affordance rather than displaying an arbitrary default profile as if it were saved.
- Once the config resolves, the selected profile radio and workflow chips SHALL match the value returned by `GET /api/openspec/config`.

#### Scenario: Section reflects the saved profile after load

- **WHEN** the global config has `profile: "expanded"`
- **AND** the section mounts and the config load succeeds
- **THEN** the `expanded` radio is selected
- **AND** the workflow chips match the expanded workflow set

#### Scenario: Transient failure is retried, not swallowed

- **WHEN** the initial config load fails transiently (e.g. a network rejection)
- **THEN** the section retries the load
- **AND** if a retry succeeds, the section shows the correct saved profile
- **AND** the section never presents a hardcoded `core` selection as the saved profile after a failure

#### Scenario: Persistent failure surfaces an error

- **WHEN** the config load fails and all retries are exhausted
- **THEN** the section shows a visible error state with a manual retry affordance
- **AND** does not display an arbitrary default profile as the saved value

### Requirement: Profile selection commits via the unified Settings Save

The OpenSpec Workflow Profile selection in the Settings panel SHALL buffer into the Settings draft and commit only when the user saves from the Settings Save Bar. The client SHALL POST `{ profile, workflows }` to `POST /api/openspec/config` as part of the unified Save fan-out, not from a section-local "Save profile" button. The endpoint contract, atomic write behavior, and post-save cache reset SHALL be unchanged.

#### Scenario: Profile buffers until the unified Save
- **WHEN** the user changes the profile radio or workflow chips in the Settings panel
- **THEN** the selection SHALL be held in the Settings draft and the Save Bar SHALL appear
- **AND** no `POST /api/openspec/config` SHALL be sent until the user saves

#### Scenario: Unified Save persists the profile
- **WHEN** the user saves from the Save Bar with a changed profile
- **THEN** the client SHALL POST `{ profile, workflows }` to `/api/openspec/config`
- **AND** on success SHALL reset the OpenSpec config cache so action buttons re-render
