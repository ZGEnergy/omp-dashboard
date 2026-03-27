## ADDED Requirements

### Requirement: Session card shows attach combo box when no proposal attached
Each session card SHALL display a `<select>` dropdown listing available changes from the folder-level OpenSpec data when the session has no attached proposal and the directory has initialized OpenSpec data.

#### Scenario: Combo box lists available changes
- **WHEN** session `"s1"` in cwd `/project/foo` has `attachedProposal = null` and the folder has changes `["add-auth", "fix-bug", "refactor-db"]`
- **THEN** the session card SHALL show a dropdown with options: placeholder "Attach change...", "add-auth", "fix-bug", "refactor-db"

#### Scenario: Selecting a change sends attach_proposal
- **WHEN** the user selects `"add-auth"` from the combo box on session `"s1"`
- **THEN** the browser SHALL send `{ type: "attach_proposal", sessionId: "s1", changeName: "add-auth" }`

#### Scenario: No OpenSpec data available
- **WHEN** the session's directory has no OpenSpec data or `initialized: false`
- **THEN** no combo box SHALL be rendered

#### Scenario: No changes available
- **WHEN** OpenSpec is initialized but has zero changes
- **THEN** the combo box SHALL be rendered as disabled with placeholder text "No changes"

#### Scenario: Changes sorted in combo box
- **WHEN** the folder has in-progress and completed changes
- **THEN** in-progress changes SHALL appear first in the dropdown, then completed changes

### Requirement: Session card shows attached change badge and actions when attached
When a session has an `attachedProposal`, the session card SHALL show the attached change name as a badge and LLM action buttons.

#### Scenario: Attached change badge
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"`
- **THEN** the session card SHALL display `📋 add-auth` as a badge

#### Scenario: LLM action buttons for in-progress change
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and the change has status `"in-progress"` or `"no-tasks"`
- **THEN** the session card SHALL show buttons: [Explore] [Continue] [FF] and [Detach]

#### Scenario: LLM action buttons for apply-ready change
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and all artifacts are done
- **THEN** the session card SHALL show button [Apply] in addition to other buttons

#### Scenario: LLM action buttons for complete change
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` and the change has status `"complete"`
- **THEN** the session card SHALL show buttons: [Explore] [Archive] and [Detach]

#### Scenario: Action buttons send prompt to session
- **WHEN** the user clicks [Continue] on session `"s1"` with attached change `"add-auth"`
- **THEN** the browser SHALL send `send_prompt` with text `/opsx:continue add-auth` to session `"s1"`

#### Scenario: Detach button clears attachment
- **WHEN** the user clicks [Detach] on session `"s1"`
- **THEN** the browser SHALL send `{ type: "detach_proposal", sessionId: "s1" }`
- **AND** the combo box SHALL reappear

#### Scenario: Ended session hides action buttons
- **WHEN** session `"s1"` has `attachedProposal = "add-auth"` but `status = "ended"`
- **THEN** the badge SHALL still show but LLM action buttons SHALL be hidden (cannot send prompts to ended sessions)

#### Scenario: Attached change not in OpenSpec data
- **WHEN** session `"s1"` has `attachedProposal = "archived-change"` but the folder's OpenSpec data does not contain that change
- **THEN** the badge SHALL still show `📋 archived-change` with a [Detach] button but no LLM action buttons
