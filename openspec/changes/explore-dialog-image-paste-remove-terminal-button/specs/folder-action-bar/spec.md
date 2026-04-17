## MODIFIED Requirements

### Requirement: Folder action bar layout
Each folder group in the sidebar SHALL render a horizontal action bar below the group header containing buttons in this order: `+Session`, `Terminals(N)`, `Editor`, `Zed`, and Pi Resources (right-aligned). The action bar SHALL replace the current scattered button layout.

#### Scenario: All buttons visible with detected editors
- **WHEN** a folder group is rendered and Zed is detected as a running native editor
- **THEN** the action bar SHALL display: +Session, Terminals(0), Editor, Zed, and Pi Resources icon
- **THEN** buttons SHALL be arranged horizontally with consistent spacing
- **THEN** the action bar SHALL NOT contain a `+Terminal` button

#### Scenario: Zed not detected
- **WHEN** a folder group is rendered and Zed is not detected
- **THEN** the Zed button SHALL NOT appear in the action bar
- **THEN** all other buttons SHALL remain visible

## REMOVED Requirements

### Requirement: +Terminal button with auto-navigation
**Reason**: The `+Terminal` quick-create button is redundant with the `Terminals(N)` → TerminalsView flow, which supports creating new terminals directly from its tab bar. Removing the button reduces visual clutter in the sidebar action bar.

**Migration**: Users SHALL click `Terminals(N)` to open the TerminalsView and create new terminals from the tab bar there. The `onCreateTerminal` prop SHALL be removed from `FolderActionBar.Props`; callers SHALL drop the handler.
