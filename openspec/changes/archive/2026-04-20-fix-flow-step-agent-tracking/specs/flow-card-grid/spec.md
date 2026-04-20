## MODIFIED Requirements

### Requirement: TUI card rendering uses renderBox helper
The TUI agent card SHALL use the `renderBox()` helper from `box-renderer.ts` for border rendering instead of manually constructing `┌─┐ │ └─┘` borders. The grid SHALL compute row height from actual rendered card output instead of a hardcoded constant.

#### Scenario: Card with alias line renders complete
- **WHEN** an agent card renders with a model alias line (e.g., `@fast`), producing more lines than the base height
- **THEN** all lines SHALL be visible in the grid including the bottom border `└───┘`

#### Scenario: Cards of different heights in same row
- **WHEN** a grid row contains cards of different heights
- **THEN** shorter cards SHALL be padded with empty lines to match the tallest card in the row
- **AND** all bottom borders SHALL be visible
