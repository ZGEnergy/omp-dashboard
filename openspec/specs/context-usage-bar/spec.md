### Requirement: Context usage gradient bar on session cards
Session cards SHALL display a compact horizontal gradient bar indicating context window usage percentage, inlined on the same row as the activity indicator and cost. The bar SHALL occupy approximately 1/5 of the card width. The cost display SHALL remain.

#### Scenario: Bar is inline with activity and cost
- **WHEN** a session card is rendered (desktop or mobile)
- **THEN** the context usage bar appears on the same row as the activity indicator and cost, between them (activity left, bar middle, cost right)

#### Scenario: Bar reflects context usage percentage
- **WHEN** a session has context usage data (e.g., 60% of context window used)
- **THEN** the card displays a compact gradient bar filled to 60%

#### Scenario: Green zone
- **WHEN** context usage is below 50%
- **THEN** the bar fill color is green

#### Scenario: Yellow zone
- **WHEN** context usage is between 50% and 80%
- **THEN** the bar fill color is yellow

#### Scenario: Red zone
- **WHEN** context usage is above 80%
- **THEN** the bar fill color is red

#### Scenario: No context data available
- **WHEN** a session has no context usage data yet
- **THEN** the bar is shown as empty/gray

#### Scenario: Percentage shown on hover only
- **WHEN** the user hovers over the compact context bar
- **THEN** a tooltip displays the percentage and token counts (e.g., "42% context used (50,000 / 120,000)")

#### Scenario: No percentage text visible
- **WHEN** the compact context bar is rendered
- **THEN** no percentage text label is displayed next to the bar

#### Scenario: Cost remains visible
- **WHEN** a session has cost data
- **THEN** the cost ($X.XX) is still displayed on the session card, to the right of the context bar
