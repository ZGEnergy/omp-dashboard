## MODIFIED Requirements

### Requirement: Sidebar collapse via toggle button
The sidebar drag handle area SHALL display a collapse chevron button, vertically centered on the right edge of the sidebar, visible on hover. Clicking it SHALL collapse the sidebar. When collapsed, the expand button SHALL be vertically centered on the collapsed strip.

#### Scenario: Collapse button always visible
- **WHEN** the sidebar is expanded
- **THEN** a subtle left-chevron collapse button SHALL be always visible, vertically centered on the drag handle edge

#### Scenario: Click collapse button
- **WHEN** user clicks the collapse chevron on the sidebar edge
- **THEN** the sidebar SHALL collapse to the thin vertical strip (~28px)

#### Scenario: Expand via collapsed strip
- **WHEN** user clicks the expand button on the collapsed strip
- **THEN** the sidebar SHALL expand to its previously saved width
- **AND** the expand button SHALL be vertically centered in the collapsed strip

#### Scenario: Collapse button does not interfere with drag
- **WHEN** user presses mouse down on the drag handle area outside the collapse button
- **THEN** drag-to-resize SHALL work normally

## ADDED Requirements

### Requirement: Sidebar default width is maximum
The sidebar default width for first-time users (no localStorage value) SHALL be 500px, equal to the maximum width.

#### Scenario: First-time user sidebar width
- **WHEN** a user opens the dashboard for the first time (no saved sidebar width)
- **THEN** the sidebar SHALL render at 500px width

#### Scenario: Existing user sidebar width preserved
- **WHEN** a user has a previously saved sidebar width of 300px in localStorage
- **THEN** the sidebar SHALL render at 300px width
