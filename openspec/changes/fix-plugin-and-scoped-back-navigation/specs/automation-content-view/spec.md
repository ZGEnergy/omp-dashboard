## ADDED Requirements

### Requirement: Automation overlay routes SHALL declare back-navigation depth

The Automations plugin's two `shell-overlay-route` claims SHALL declare a `depth` (and `parentPath` where applicable) so the shell's global depth-aware back action resolves them instead of treating them as the card list (depth 0) and no-opping.

- The board route `/folder/:encodedCwd/automations` SHALL declare `depth: 1`. Its back target SHALL be `/` (cards).
- The run-monitor route `/automation/run/:sid` SHALL declare `depth: 2` and `parentPath: "/folder/:encodedCwd/automations"`. Its back target SHALL be the board route for the cwd the run belongs to.

The board's back control SHALL continue to invoke the shell-provided `onBack` callback; no plugin-local back logic SHALL be added.

#### Scenario: Board back returns to cards
- **GIVEN** the user opened the Automations board at `/folder/<encoded cwd>/automations`
- **WHEN** the user activates the board back control
- **THEN** the app SHALL navigate to `/` (cards)
- **AND** the back control SHALL NOT be a no-op

#### Scenario: Run monitor back returns to the board
- **GIVEN** the user opened a run monitor at `/automation/run/<sid>` from the board for cwd `/Users/u/proj`
- **WHEN** the user activates the depth-aware back action
- **THEN** the app SHALL navigate to `/folder/<encoded /Users/u/proj>/automations`
- **AND** SHALL NOT navigate to `/` or to an unrelated route

#### Scenario: Legacy manifest without depth still backs to cards
- **GIVEN** an automation manifest whose `shell-overlay-route` board claim omits `depth`
- **WHEN** the user activates the board back control
- **THEN** the route SHALL resolve to `depth 2` by default and the back action SHALL navigate to `/`
- **AND** the back control SHALL NOT be a dead no-op
