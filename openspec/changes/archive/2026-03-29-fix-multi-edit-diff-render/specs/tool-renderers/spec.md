## MODIFIED Requirements

### Requirement: EditToolRenderer
The Edit renderer SHALL display the file path as a header. When `oldText` and `newText` arguments are present, they SHALL be rendered as a unified diff view using the `DiffView` component. When an `edits` array argument is present, each entry's `oldText` and `newText` SHALL be rendered as a separate `DiffView`, stacked vertically with a thin border separator between them. When neither format is present, arguments SHALL be displayed as raw JSON.

#### Scenario: Single edit displayed as diff
- **WHEN** an edit tool call has `oldText` and `newText` arguments
- **THEN** the renderer SHALL show a single diff view of oldText → newText

#### Scenario: Multi-edit displayed as stacked diffs
- **WHEN** an edit tool call has an `edits` array with multiple entries
- **THEN** the renderer SHALL show one diff view per entry, separated by thin borders

#### Scenario: Empty or missing edit data shows raw JSON
- **WHEN** an edit tool call has neither `oldText`/`newText` nor `edits` array
- **THEN** the renderer SHALL display the arguments as formatted JSON
