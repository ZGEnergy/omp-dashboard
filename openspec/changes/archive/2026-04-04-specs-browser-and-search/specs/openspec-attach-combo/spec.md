## ADDED Requirements

### Requirement: Bulk Archive button on session card when completed changes exist
The `SessionOpenSpecActions` component SHALL render a "Bulk Archive" button in the action buttons row when at least one change in the folder has `status === "complete"`. The button SHALL be available regardless of whether the session has an attached change.

#### Scenario: Bulk Archive shown when completed changes exist
- **WHEN** session `"s1"` is in cwd `/project/foo` and the folder has changes `["done-change" (complete), "wip-change" (in-progress)]`
- **THEN** the session card SHALL show a "Bulk Archive" button in the action buttons area

#### Scenario: Bulk Archive hidden when no completed changes
- **WHEN** session `"s1"` is in cwd `/project/foo` and all changes have status `in-progress` or `active`
- **THEN** no "Bulk Archive" button SHALL appear on the session card

#### Scenario: Bulk Archive confirmation dialog
- **WHEN** the user clicks "Bulk Archive" on session `"s1"`
- **THEN** a confirmation dialog SHALL appear with message "Bulk archive all completed changes?"

#### Scenario: Bulk Archive confirmed sends message
- **WHEN** the user confirms the Bulk Archive dialog on a session with cwd `/project/foo`
- **THEN** the browser SHALL send `{ type: "openspec_bulk_archive", cwd: "/project/foo" }`

#### Scenario: Bulk Archive cancelled
- **WHEN** the user cancels the Bulk Archive dialog
- **THEN** no action SHALL be taken

#### Scenario: Bulk Archive disabled when streaming
- **WHEN** session `"s1"` has `status = "streaming"` and completed changes exist
- **THEN** the "Bulk Archive" button SHALL be shown but disabled

#### Scenario: Bulk Archive on unattached session
- **WHEN** session `"s1"` has no attached proposal and completed changes exist in the folder
- **THEN** the "Bulk Archive" button SHALL appear alongside the attach combo box and other buttons

#### Scenario: Bulk Archive on attached session
- **WHEN** session `"s1"` has `attachedProposal = "my-change"` and completed changes exist in the folder
- **THEN** the "Bulk Archive" button SHALL appear in the action buttons row alongside Explore/Apply/etc.
