## MODIFIED Requirements

### Requirement: Per-session-card slot claims gated on extension

The plugin SHALL contribute two claims on the `session-card-memory` slot (introduced by `redesign-session-card-subcards`): `HonchoBadge` (status pill) and `HonchoCardActions` (Interview / Sync / Map-name buttons). Both contributions SHALL render `null` when `pi-memory-honcho` is not installed. The plugin SHALL NOT claim the `anchored-popover` slot; per-card dialogs are owned locally by `HonchoCardActions` and rendered through `DialogPortal`.

#### Scenario: Manifest claims exactly three slot entries

- **WHEN** the plugin manifest in `packages/honcho-plugin/package.json` is read
- **THEN** the `claims[]` array contains exactly three entries: one `settings-section` (tab=general), and two `session-card-memory` (HonchoBadge and HonchoCardActions)
- **AND** the array contains no `anchored-popover` entry

#### Scenario: Three buttons render on every card when extension installed

- **WHEN** the user views any session card and `pi-memory-honcho` is installed
- **THEN** every session card renders three honcho buttons: `[🧠 Interview]`, `[🔄 Sync]`, `[🏷️ Map name]`
- **AND** clicking `[🧠 Interview]` mounts the `HonchoInterviewDialog` via `DialogPortal`
- **AND** clicking `[🏷️ Map name]` mounts the `HonchoMapNameDialog` via `DialogPortal`
- **AND** clicking `[🔄 Sync]` triggers `POST /api/plugins/honcho/sync` directly without opening a dialog

#### Scenario: Card actions hidden when extension absent

- **WHEN** `pi-memory-honcho` is not installed
- **THEN** `HonchoBadge` returns `null` and renders nothing in the MEMORY subcard
- **AND** `HonchoCardActions` returns `null` and renders no buttons

### Requirement: Per-card Interview dialog

The plugin SHALL render the Interview interaction as a portal-based dialog (`DialogPortal`) instead of an anchored popover. The dialog SHALL contain a multi-line textarea so users can write paragraph-length preferences. The dialog SHALL be centered on desktop (≥ 640 px viewport) and full-screen on mobile (< 640 px).

#### Scenario: Open Interview dialog

- **WHEN** the user clicks `[🧠 Interview]` on a session card
- **THEN** a dialog mounts at `document.body` via `DialogPortal`
- **AND** the dialog header reads "Save a memory preference"
- **AND** the dialog body contains a `<textarea>` with at least 6 visible rows and a vertical-resize handle
- **AND** the page background is dimmed by the dialog backdrop and scroll-locked

#### Scenario: Interview submission

- **WHEN** the user enters a preference into the textarea and clicks Save
- **THEN** the plugin calls `POST /api/plugins/honcho/interview` with `{ content }` containing the trimmed textarea value
- **AND** the server creates a conclusion via `aiPeer.conclusionsOf(userPeer).create(...)` against the configured workspace
- **AND** on success the dialog closes and the textarea is cleared
- **AND** on failure an inline error appears below the textarea and the dialog stays open

#### Scenario: Save disabled on empty input

- **WHEN** the textarea is empty or contains only whitespace
- **THEN** the Save button is disabled
- **AND** pressing Enter inside the textarea inserts a newline and does not submit

#### Scenario: Cancel and Esc close without writing

- **WHEN** the user clicks Cancel, presses Esc, or clicks the backdrop
- **THEN** the dialog unmounts
- **AND** no POST request is issued

### Requirement: Per-card "Map name" dialog

The plugin SHALL render the per-cwd Honcho session-name editor as a portal-based dialog (`DialogPortal`) instead of an `anchored-popover` claim. The dialog SHALL pre-fill its input with the existing mapping or the derived default per the configured `sessionStrategy`. Save SHALL upsert `hosts.pi.sessions[cwd] = name`. Clear SHALL remove the mapping.

#### Scenario: Open dialog with current mapping

- **WHEN** the user clicks `[🏷️ Map name]` on a session card with `cwd=/path/to/project` and `~/.honcho/config.json` contains `hosts.pi.sessions["/path/to/project"] = "my-project"`
- **THEN** the dialog opens with the input pre-filled with `my-project`
- **AND** the "Clear mapping" button is visible in the footer

#### Scenario: Open dialog without existing mapping

- **WHEN** the user clicks `[🏷️ Map name]` on a session card with no existing mapping
- **THEN** the dialog opens with the input pre-filled with the derived default per the configured `sessionStrategy`
- **AND** the "Clear mapping" button is hidden

#### Scenario: Save creates mapping

- **WHEN** the user enters `custom-name` and clicks Save
- **THEN** the plugin calls `POST /api/plugins/honcho/sessions` with `{ cwd, name: "custom-name" }`
- **AND** the server upserts `hosts.pi.sessions[cwd] = "custom-name"`
- **AND** on success the dialog closes

#### Scenario: Clear removes mapping

- **WHEN** an existing mapping is loaded and the user clicks the "Clear mapping" button
- **THEN** the plugin calls `DELETE /api/plugins/honcho/sessions` with `{ cwd }`
- **AND** the server removes the key from `hosts.pi.sessions`
- **AND** on success the dialog closes

#### Scenario: Save disabled when input unchanged or empty

- **WHEN** the input value matches the currently stored mapping, OR the input is empty / whitespace-only
- **THEN** the Save button is disabled

#### Scenario: Cancel and Esc close without writing

- **WHEN** the user clicks Cancel, presses Esc, or clicks the backdrop
- **THEN** the dialog unmounts
- **AND** no POST or DELETE request is issued

#### Scenario: Only one card-action dialog open at a time per card

- **WHEN** the Interview dialog is open on session A and the user attempts to click any other card's action button
- **THEN** the click is captured by the dialog's backdrop instead
- **AND** the user must close the current dialog (Esc / backdrop click / Cancel) before opening another

## REMOVED Requirements

### Requirement: Per-card "Map name" popover

**Reason**: The anchored popover suffered from clipping by the session-card's overflow boundary, cramped input area, and z-index conflicts. Replaced by `Per-card "Map name" dialog` (rendered via `DialogPortal`) which solves all three issues and aligns with every other input-bearing surface in the dashboard. The plugin no longer claims the `anchored-popover` slot.

**Migration**: Plugin manifest in `packages/honcho-plugin/package.json` drops the `anchored-popover` claim. `HonchoMapPopover.tsx` is deleted; replaced by `HonchoMapNameDialog.tsx`. No server-side changes; REST contract is unchanged.
