## MODIFIED Requirements

### Requirement: Tab close button visibility
Each terminal tab SHALL display a close (X) button that becomes visible on hover. The tab container element MUST have the `group` CSS class so that child elements using `group-hover:` utility classes respond to hover state.

#### Scenario: Hovering over a terminal tab shows close button
- **WHEN** the user hovers over a terminal tab in the tab bar
- **THEN** the close (X) button becomes visible (opacity transitions from 0 to 1)

#### Scenario: Close button hidden when not hovering
- **WHEN** the user is not hovering over a terminal tab
- **THEN** the close (X) button is hidden (opacity 0)

### Requirement: Terminal creation navigates to tab view
When a new terminal is created (via `terminal_created` event), the client SHALL navigate to the tabbed terminals view at `/folder/:encodedCwd/terminals` with the new terminal's ID as the active tab. The client SHALL NOT navigate to the legacy `/terminal/:id` fullscreen route.

#### Scenario: New terminal opens in tab view
- **WHEN** a `terminal_created` event is received from the server
- **THEN** the client navigates to `/folder/<encodedCwd>/terminals`
- **AND** the newly created terminal is the active tab

#### Scenario: Terminal button opens tab view
- **WHEN** the user clicks the terminal button in the session sidebar
- **THEN** the tabbed terminals view opens (no change — already correct)
