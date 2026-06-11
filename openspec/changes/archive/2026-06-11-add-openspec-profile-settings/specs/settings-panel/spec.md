## ADDED Requirements

### Requirement: OpenSpec Workflow Profile section

The Settings panel's Advanced tab SHALL include an "OpenSpec Workflow Profile" section that lets the user select the global OpenSpec profile and refresh projects.

The section SHALL contain:
- A radio group with three options: **Core**, **Expanded**, **Custom**. Selecting Core or Expanded SHALL fill the displayed workflow set with that profile's fixed list. Selecting Custom SHALL enable an 11-chip workflow multiselect (`propose, explore, new, continue, ff, apply, verify, sync, archive, bulk-archive, onboard`).
- A **Save profile** button that POSTs the selected `{ profile, workflows }` to `/api/openspec/config`. On success, the client SHALL reset the OpenSpec config cache so action buttons re-render immediately.
- A **warning banner** stating the change affects the global OpenSpec config for all tools on the machine.
- An **Update all projects** button that POSTs `{ all: true }` to `/api/openspec/update`.
- A **collapsible** per-cwd project list, **collapsed by default**, that lists each known cwd with a staleness badge (`up to date`, `needs update`, or `unknown`) from `/api/openspec/update-status` and a per-cwd **Update** button that POSTs `{ cwd }` to `/api/openspec/update`.

#### Scenario: Section renders in the Advanced tab

- **WHEN** the user opens Settings and selects the Advanced tab
- **THEN** an "OpenSpec Workflow Profile" section is shown with the profile radio, Save button, Update all button, and a collapsed per-cwd list

#### Scenario: Selecting Custom reveals the workflow multiselect

- **WHEN** the user selects the Custom radio option
- **THEN** the 11-workflow multiselect becomes interactive
- **AND** selecting Core or Expanded instead disables it and fills the fixed workflow set

#### Scenario: Save profile persists and refreshes buttons

- **WHEN** the user picks a profile and clicks Save profile
- **THEN** the client POSTs `{ profile, workflows }` to `/api/openspec/config`
- **AND** on success resets the OpenSpec config cache so session-card and composer buttons re-render

#### Scenario: Per-cwd list is collapsed by default and expandable

- **WHEN** the section first renders
- **THEN** the per-cwd project list is collapsed
- **AND** clicking the show/hide toggle expands it to reveal each cwd's staleness badge and Update button

#### Scenario: Stale projects are distinguishable

- **WHEN** the per-cwd list is expanded
- **THEN** each project shows `up to date`, `needs update`, or `unknown`
- **AND** projects needing an update expose an enabled per-cwd Update button

#### Scenario: Update all triggers a bulk update

- **WHEN** the user clicks Update all projects
- **THEN** the client POSTs `{ all: true }` to `/api/openspec/update`
- **AND** the per-cwd staleness badges refresh from `/api/openspec/update-status`
