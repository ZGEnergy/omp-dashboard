## MODIFIED Requirements

### Requirement: Sidebar header
The sidebar header SHALL display Pi branding (π symbol) that links to home (`/`) instead of the static "Sessions" text. Filter controls (theme picker, active only, show hidden) SHALL remain in the header row.

#### Scenario: Header displays Pi branding
- **WHEN** the sidebar is rendered
- **THEN** the header shows a styled "π" symbol linking to `/` alongside the existing filter controls

#### Scenario: Header no longer shows Sessions text
- **WHEN** the sidebar is rendered
- **THEN** the text "Sessions" does not appear in the sidebar header

### Requirement: Folder group content
Each folder group SHALL contain the group header (folder name, git info), the folder action bar, optional OpenSpec section, and pi session cards only. Terminal cards SHALL NOT appear in the folder group. The unified sort order SHALL contain only pi session IDs.

#### Scenario: Folder group with sessions and terminals
- **WHEN** a folder has 2 pi sessions and 3 terminals
- **THEN** the sidebar SHALL show 2 pi session cards in the folder group
- **THEN** no terminal cards SHALL appear in the sidebar
- **THEN** the Terminals button in the action bar SHALL show `Terminals(3)`

#### Scenario: Folder group with no sessions
- **WHEN** a folder has no pi sessions but has pinned directory status
- **THEN** the folder group SHALL show the action bar with all buttons
- **THEN** no session cards SHALL appear
