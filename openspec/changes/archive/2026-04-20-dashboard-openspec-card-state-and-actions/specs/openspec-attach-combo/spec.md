## ADDED Requirements

### Requirement: Session card displays ChangeState pill next to attached badge
When a session has an `attachedProposal` and the corresponding change is present in the folder's OpenSpec data, the session card SHALL render a small state pill adjacent to the attached-change badge displaying the `ChangeState` value (`PLANNING` / `READY` / `IMPLEMENTING` / `COMPLETE`) with a color-coded text/border scheme — zinc for `PLANNING`, blue for `READY`, amber for `IMPLEMENTING`, green for `COMPLETE`.

#### Scenario: IMPLEMENTING pill for in-progress change
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and `deriveChangeState` returns `IMPLEMENTING`
- **THEN** the session card SHALL display a pill reading `IMPLEMENTING` in amber next to the `📋 add-auth` badge

#### Scenario: COMPLETE pill for completed change
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and `deriveChangeState` returns `COMPLETE`
- **THEN** the session card SHALL display a pill reading `COMPLETE` in green next to the `📋 add-auth` badge

#### Scenario: Attached change missing from OpenSpec data hides pill
- **WHEN** session `"s1"` has `attachedProposal = "archived-change"` but the folder's OpenSpec data does not contain that change
- **THEN** no state pill SHALL be rendered

## MODIFIED Requirements

### Requirement: Session card shows attached change badge and actions when attached
When a session has an `attachedProposal`, the session card SHALL show the attached change name as a badge with `text-blue-400` color, a `ChangeState` pill next to the badge (per the "displays ChangeState pill" requirement), and LLM action buttons driven by `deriveChangeState`. When `deriveChangeState` returns `IMPLEMENTING` **and** the change has `isComplete === true` **and** all artifacts are `done`, the action row SHALL additionally expose an **Archive anyway** action in an overflow menu. Action buttons are disabled when session status is `streaming` and hidden when `ended`.

#### Scenario: Attached change badge with blue color
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"`
- **THEN** the session card SHALL display `📋 add-auth` with the name in `text-blue-400`

#### Scenario: LLM action buttons for PLANNING state
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and `deriveChangeState` returns `PLANNING`
- **THEN** the session card SHALL show buttons: [Explore] [Continue] [FF] and [Detach]

#### Scenario: LLM action buttons for READY state
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and `deriveChangeState` returns `READY`
- **THEN** the session card SHALL show buttons: [Explore] [Apply] and [Detach]

#### Scenario: LLM action buttons for IMPLEMENTING state
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and `deriveChangeState` returns `IMPLEMENTING`
- **THEN** the session card SHALL show buttons: [Explore] [Apply] and [Detach]

#### Scenario: Archive-anyway overflow action for artifacts-done IMPLEMENTING
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"`, `deriveChangeState` returns `IMPLEMENTING`, `change.isComplete === true`, and every artifact has `status === "done"`
- **THEN** the action row SHALL include an overflow menu (⋯) containing an **Archive anyway** item
- **AND** selecting **Archive anyway** SHALL open a `ConfirmDialog` with message "N of M tasks are unchecked. Archive anyway?"
- **AND** confirming SHALL send `send_prompt` with text `/opsx:archive add-auth` to the session

#### Scenario: Archive-anyway not shown when isComplete is false or undefined
- **WHEN** session `"s1"` is IMPLEMENTING but `change.isComplete !== true` (false or undefined)
- **THEN** no **Archive anyway** action SHALL be offered

#### Scenario: LLM action buttons for COMPLETE state
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and `deriveChangeState` returns `COMPLETE`
- **THEN** the session card SHALL show buttons: [Explore] [Verify] [Archive] and [Detach]

#### Scenario: Action buttons disabled when streaming
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and `status = "streaming"`
- **THEN** action buttons (Explore, Continue, FF, Apply, Verify, Archive, Archive anyway) SHALL be shown but disabled

#### Scenario: Verify button sends verify command
- **WHEN** the user clicks [Verify] on session `"s1"` with attached change `"add-auth"`
- **THEN** the browser SHALL send `send_prompt` with text `/opsx:verify add-auth` to session `"s1"`

#### Scenario: Action buttons send prompt to session
- **WHEN** the user clicks [Continue] on session `"s1"` with attached change `"add-auth"`
- **THEN** the browser SHALL send `send_prompt` with text `/opsx:continue add-auth` to session `"s1"`

#### Scenario: Detach button clears attachment
- **WHEN** the user clicks [Detach] on session `"s1"`
- **THEN** the browser SHALL send `{ type: "detach_proposal", sessionId: "s1" }`
- **AND** the combo box SHALL reappear

#### Scenario: Ended session hides action buttons
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` but `status = "ended"`
- **THEN** the badge SHALL still show but LLM action buttons SHALL be hidden

#### Scenario: Attached change not in OpenSpec data
- **WHEN** session `"s1"` has `attachedProposal = "archived-change"` but the folder's OpenSpec data does not contain that change
- **THEN** the badge SHALL still show `📋 archived-change` with a [Detach] button but no LLM action buttons

### Requirement: Bulk Archive button on session card when completed changes exist
The `SessionOpenSpecActions` component SHALL render a "Bulk Archive" button **only on unattached sessions** when at least one change in the folder has `status === "complete"`. Attached-session action rows SHALL NOT render a Bulk Archive button.

#### Scenario: Bulk Archive shown on unattached session when completed changes exist
- **WHEN** session `"s1"` has no attached proposal, is in cwd `/project/foo`, and the folder has changes `["done-change" (complete), "wip-change" (in-progress)]`
- **THEN** the session card SHALL show a "Bulk Archive" button alongside the attach combo box

#### Scenario: Bulk Archive hidden when no completed changes
- **WHEN** session `"s1"` has no attached proposal and all folder changes have status `in-progress` or `active`
- **THEN** no "Bulk Archive" button SHALL appear

#### Scenario: Bulk Archive hidden on attached sessions
- **WHEN** session `"s1"` has `attachedProposal = "my-change"` and the folder also contains a completed change
- **THEN** the attached-session action row SHALL NOT render a "Bulk Archive" button

#### Scenario: Bulk Archive confirmation dialog
- **WHEN** the user clicks "Bulk Archive" on an unattached session `"s1"`
- **THEN** a confirmation dialog SHALL appear with message "Bulk archive all completed changes?"

#### Scenario: Bulk Archive confirmed sends message
- **WHEN** the user confirms the Bulk Archive dialog on a session with cwd `/project/foo`
- **THEN** the browser SHALL send `{ type: "openspec_bulk_archive", cwd: "/project/foo" }`

#### Scenario: Bulk Archive cancelled
- **WHEN** the user cancels the Bulk Archive dialog
- **THEN** no action SHALL be taken

#### Scenario: Bulk Archive disabled when streaming
- **WHEN** unattached session `"s1"` has `status = "streaming"` and completed changes exist
- **THEN** the "Bulk Archive" button SHALL be shown but disabled
