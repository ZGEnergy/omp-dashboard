### Requirement: Sidebar drag-to-resize
The sidebar SHALL be resizable by dragging a handle on its right edge. The width SHALL be constrained between 180px minimum and 500px maximum.

#### Scenario: Drag to resize
- **WHEN** user presses mouse down on the drag handle and moves horizontally
- **THEN** the sidebar width updates to follow the cursor, clamped to 180–500px

#### Scenario: Width clamped at minimum
- **WHEN** user drags the handle to less than 180px
- **THEN** the sidebar width remains at 180px

#### Scenario: Width clamped at maximum
- **WHEN** user drags the handle to more than 500px
- **THEN** the sidebar width remains at 500px

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

### Requirement: Sidebar default width is maximum
The sidebar default width for first-time users (no localStorage value) SHALL be 500px, equal to the maximum width.

#### Scenario: First-time user sidebar width
- **WHEN** a user opens the dashboard for the first time (no saved sidebar width)
- **THEN** the sidebar SHALL render at 500px width

#### Scenario: Existing user sidebar width preserved
- **WHEN** a user has a previously saved sidebar width of 300px in localStorage
- **THEN** the sidebar SHALL render at 300px width

### Requirement: Sidebar state persistence
The sidebar width and collapsed state SHALL be persisted to localStorage and restored on page reload.

#### Scenario: Width persisted across reload
- **WHEN** user resizes the sidebar to 350px and reloads the page
- **THEN** the sidebar loads at 350px

#### Scenario: Collapsed state persisted across reload
- **WHEN** user collapses the sidebar and reloads the page
- **THEN** the sidebar loads in collapsed state

### Requirement: Mobile responsive overlay
On screens narrower than 768px, the sidebar SHALL be hidden by default. A hamburger menu button SHALL be displayed. Tapping it SHALL open the sidebar as a fixed overlay with a backdrop.

#### Scenario: Sidebar hidden on mobile
- **WHEN** viewport width is less than 768px
- **THEN** the sidebar is not visible and a hamburger button is shown

#### Scenario: Open overlay via hamburger
- **WHEN** user taps the hamburger button on mobile
- **THEN** the sidebar opens as a fixed overlay with a dimmed backdrop

#### Scenario: Close overlay via backdrop
- **WHEN** user taps the backdrop behind the mobile overlay
- **THEN** the sidebar overlay closes

#### Scenario: Close overlay on session select
- **WHEN** user selects a session in the mobile overlay
- **THEN** the sidebar overlay closes
