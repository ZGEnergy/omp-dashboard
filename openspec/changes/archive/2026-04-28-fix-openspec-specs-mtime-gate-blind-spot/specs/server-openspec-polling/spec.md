## MODIFIED Requirements

### Requirement: Change-detection gate to avoid redundant CLI invocations

The server SHALL support an mtime-based change-detection gate that skips `openspec list` / `openspec status` CLI invocations when no tracked artifact in `openspec/changes/` has changed since the last successful poll. The gate SHALL be controlled by `DashboardConfig.openspec.changeDetection` with values `"mtime"` (default) and `"always"` (re-poll unconditionally, matching pre-change behavior).

The gate SHALL use **file-aware effective mtime** rather than directory mtime alone, because POSIX directory mtime does not advance when a file inside the directory is edited in place.

#### Scenario: List-step gate signal

- **WHEN** `changeDetection` is `"mtime"` and the cache has a previous `listResult`
- **THEN** the server SHALL compute the list-step effective mtime as the maximum of:
  - `mtime(<cwd>/openspec/changes/)`
  - `mtime(<cwd>/openspec/changes/<name>/tasks.md)` for each `<name>` in the cached list result
- **AND** the server SHALL skip `openspec list` and reuse the cached `listResult` when this effective mtime equals the cached value

#### Scenario: Per-change status-step gate signal

- **WHEN** `changeDetection` is `"mtime"` and the per-change cache has an entry for `<name>`
- **THEN** the server SHALL compute the per-change effective mtime as the maximum of:
  - `mtime(<cwd>/openspec/changes/<name>/)`
  - `mtime(<cwd>/openspec/changes/<name>/tasks.md)`
  - `mtime(<cwd>/openspec/changes/<name>/proposal.md)`
  - `mtime(<cwd>/openspec/changes/<name>/design.md)`
  - `mtime(<cwd>/openspec/changes/<name>/specs/)`
  - `mtime(<cwd>/openspec/changes/<name>/specs/<cap>/)` for each immediate child directory of `specs/`
  - `mtime(<cwd>/openspec/changes/<name>/specs/<cap>/spec.md)` for each immediate child directory of `specs/` that contains a `spec.md`
- **AND** the server SHALL skip `openspec status --change <name>` and reuse the cached entry when this effective mtime equals the cached value
- **AND** missing files or directories (e.g. a change with no `specs/` yet) SHALL be excluded from the maximum (treated as "skip"), not treated as zero or `NaN`
- **AND** enumeration of `specs/<cap>/` directories MUST be wrapped in a `try`/`catch` (or equivalent) so that an `ENOENT` on `<change>/specs/` returns an empty fan-out rather than throwing

#### Scenario: Unchanged directory skips list CLI

- **WHEN** the list-step effective mtime matches the cached value
- **THEN** the server SHALL reuse the cached `list` result and SHALL NOT spawn `openspec list`

#### Scenario: Unchanged change skips status CLI

- **WHEN** the per-change effective mtime matches the cached value for that change
- **THEN** the server SHALL reuse the cached status entry and SHALL NOT spawn `openspec status --change <name>`

#### Scenario: In-place edit to tasks.md re-runs status

- **WHEN** an external actor (the user's IDE, the agent's `Edit` tool, the openspec CLI's `change update`) writes new content to `openspec/changes/foo/tasks.md` without renaming or recreating the file
- **THEN** on the next gated poll the server SHALL spawn `openspec list` exactly once
- **AND** SHALL spawn `openspec status --change foo` exactly once
- **AND** SHALL NOT spawn `openspec status` for any other unchanged change in the same directory
- **AND** the resulting `openspec_update` broadcast SHALL carry the new `completedTasks` value

#### Scenario: In-place edit to proposal.md or design.md re-runs status

- **WHEN** an external actor writes new content to `openspec/changes/foo/proposal.md` or `openspec/changes/foo/design.md` without renaming
- **THEN** on the next gated poll the server SHALL spawn `openspec status --change foo` exactly once
- **AND** SHALL NOT spawn `openspec status` for any other unchanged change

#### Scenario: New capability subdirectory created under specs/

- **WHEN** an external actor creates a new directory `openspec/changes/foo/specs/<cap>/` (e.g. `mkdir specs/mobile-resilience`)
- **THEN** `mtime(<cwd>/openspec/changes/foo/specs/)` SHALL advance
- **AND** on the next gated poll the server SHALL spawn `openspec status --change foo` exactly once
- **AND** SHALL NOT spawn `openspec status` for any other unchanged change

#### Scenario: New spec.md file created inside an existing capability directory

- **WHEN** an external actor writes `openspec/changes/foo/specs/<cap>/spec.md` for the first time, where `specs/<cap>/` already existed
- **THEN** `mtime(<cwd>/openspec/changes/foo/specs/<cap>/)` SHALL advance (POSIX entry-create semantics)
- **AND** on the next gated poll the server SHALL spawn `openspec status --change foo` exactly once
- **AND** the resulting `openspec_update` broadcast SHALL reflect the new `specs` artifact status (typically a transition from `ready` → `done`)
- **AND** SHALL NOT spawn `openspec status` for any other unchanged change

#### Scenario: In-place edit to existing spec.md re-runs status

- **WHEN** an external actor writes new content to an existing `openspec/changes/foo/specs/<cap>/spec.md` without renaming or recreating the file
- **THEN** `mtime(openspec/changes/foo/specs/<cap>/spec.md)` SHALL advance
- **AND** on the next gated poll the server SHALL spawn `openspec status --change foo` exactly once
- **AND** SHALL NOT spawn `openspec status` for any other unchanged change

#### Scenario: Deletion of a capability subdirectory under specs/

- **WHEN** an external actor removes `openspec/changes/foo/specs/<cap>/` (e.g. `rm -rf specs/mobile-resilience`)
- **THEN** `mtime(<cwd>/openspec/changes/foo/specs/)` SHALL advance
- **AND** on the next gated poll the server SHALL spawn `openspec status --change foo` exactly once
- **AND** the per-change cache SHALL stamp the new effective mtime so subsequent unchanged ticks again hit the gate

#### Scenario: Multi-spec authoring after a no-specs poll does not stale the cache

- **GIVEN** the dashboard polled `foo` once when `<change>/specs/` did not yet exist (or contained no `spec.md` files), and the cache stamped `specs: ready`
- **WHEN** the user subsequently authors `specs/<cap-a>/spec.md` and `specs/<cap-b>/spec.md`
- **THEN** the per-change effective mtime computed on the next poll SHALL differ from the stamped value
- **AND** the server SHALL spawn `openspec status --change foo` exactly once
- **AND** the resulting cache entry SHALL reflect the post-authoring artifact statuses
- **AND** the dashboard SHALL NOT continue serving the stale `specs: ready` from cache

#### Scenario: Change added or removed

- **WHEN** a new change directory appears, or an existing one is deleted or archived
- **THEN** `mtime(<cwd>/openspec/changes/)` SHALL advance, causing `openspec list` to run
- **AND** the per-change cache SHALL be pruned of entries no longer present in the list result

#### Scenario: First poll with no cached list result

- **WHEN** the cache for a directory has no `listResult` (e.g. server start, freshly added directory)
- **THEN** the gate SHALL be skipped and `openspec list` SHALL run unconditionally

#### Scenario: Change-detection disabled

- **WHEN** `changeDetection` is `"always"`
- **THEN** the server SHALL run `openspec list` and all `openspec status` invocations on every poll tick (matching pre-change behavior)

#### Scenario: Force refresh uses the gate (not bypass)

- **WHEN** `openspec_refresh { cwd }` is received, or `refreshOpenSpec(cwd)` is called by server code, or `onDirectoryAdded(cwd)` runs
- **THEN** the change-detection gate SHALL be evaluated with the file-aware effective mtime
- **AND** the CLI SHALL be invoked only for the list step and per-change steps whose effective mtime has advanced
- **AND** the gate SHALL still be honored — force-mode is no longer required for correctness, because the gate now correctly reflects in-place file edits

NOTE: This is a third delta on the same `Change-detection gate to avoid redundant CLI invocations` requirement. Prior deltas: `fix-openspec-mtime-gate-blind-spots` (added `tasks.md`/`proposal.md`/`design.md` to the watch set), `fix-openspec-mtime-gate-toctou` (added the post-call effective-mtime re-check). This delta extends the watch set to `specs/**` and is otherwise additive — every prior scenario remains in force.

## ADDED Requirements

### Requirement: Local specs evidence promotes the specs artifact status

The dashboard SHALL post-process the per-change `artifacts` array returned by `openspec status --change <name> --json` so that the `specs` artifact's `status` is promoted from `"ready"` to `"done"` when local file-system evidence indicates spec authoring is satisfied. The override MUST NOT alter any other artifact id, MUST NOT demote `"done"` to any other value, and MUST NOT promote `"blocked"` directly to `"done"`.

The override SHALL be implemented as a pure rule evaluator in a new module `packages/shared/src/openspec-specs-evidence.ts`, parallel in shape to the existing `openspec-design-evidence.ts`, plus an injected probe factory threaded through `buildOpenSpecData(...)` and the production poll paths.

#### Scenario: any spec.md under specs/ satisfies specs

- **WHEN** the change directory contains at least one file matching `specs/**/*.md`
- **AND** the CLI reports `artifacts[specs].status === "ready"`
- **THEN** `artifacts[specs].status` SHALL be promoted to `"done"`.

#### Scenario: empty specs directory does not satisfy specs

- **WHEN** the change directory contains a `specs/` directory but no `*.md` files anywhere underneath it
- **THEN** `artifacts[specs].status` SHALL remain `"ready"` (matches CLI verdict).

#### Scenario: missing specs directory does not throw

- **WHEN** the change directory does not contain a `specs/` directory at all
- **THEN** the probe SHALL return `false` without throwing
- **AND** `artifacts[specs].status` SHALL remain unchanged from the CLI verdict.

#### Scenario: blocked specs artifact is never promoted

- **WHEN** the CLI reports `artifacts[specs].status === "blocked"`
- **THEN** the override SHALL NOT promote it to `"done"` regardless of local evidence.

#### Scenario: done specs artifact is never demoted

- **WHEN** the CLI reports `artifacts[specs].status === "done"`
- **THEN** the override SHALL NOT alter the status (no-op promote-only override).

#### Scenario: only specs artifact may be mutated

- **WHEN** the override evaluates a change
- **THEN** the `status` of every artifact other than `specs` SHALL be passed through unchanged from the CLI verdict.

#### Scenario: probe factory is optional in buildOpenSpecData

- **WHEN** `buildOpenSpecData(...)` is called without a `specsProbeFactory` argument
- **THEN** the function SHALL match the pre-change behavior verbatim (no specs override fires)
- **AND** test callers that omit the factory SHALL continue to pass.

### Requirement: Change-level isComplete agrees with overridden specs artifact

After the specs-artifact override is applied, the dashboard SHALL re-derive the change-level `isComplete` flag using the same logic that the design override already triggers (post-override, all artifacts done ⇒ promote `isComplete: false → true`; never demote CLI `true`).

#### Scenario: all artifacts done after specs override

- **WHEN** every artifact in the post-override `artifacts` array has `status === "done"`
- **THEN** `isComplete` SHALL be `true`.

#### Scenario: specs promoted but other artifact still not done

- **WHEN** the specs override promotes `specs: ready → done` but at least one other artifact is `ready` or `blocked`
- **THEN** `isComplete` SHALL be the value reported by the CLI (no promotion to true based on a partial promotion).
