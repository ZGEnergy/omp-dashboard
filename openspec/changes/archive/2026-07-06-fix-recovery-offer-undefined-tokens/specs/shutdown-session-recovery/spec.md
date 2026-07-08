## ADDED Requirements

### Requirement: Recovery offer SHALL render with defined theme tokens so its surface and primary action are visible

The recovery offer notification SHALL bind its card background and its primary
"Reopen" action background to CSS custom properties that are declared in the active
theme. It SHALL NOT reference undeclared custom properties for these paints, because
an undeclared custom property resolves to the empty string and yields an unset
background — a transparent card or an invisible action. Specifically, the card
background SHALL use `--bg-surface` and the primary action background SHALL use
`--accent-primary` (both declared for every theme in `packages/client/src/index.css`).

#### Scenario: Offer card paints an opaque elevated surface

- **GIVEN** the recovery offer notification is rendered in any theme
- **WHEN** the client paints the offer card
- **THEN** the card background SHALL resolve to a defined theme token (`--bg-surface`)
- **AND** the card SHALL NOT be transparent

#### Scenario: Reopen action is visible

- **GIVEN** a rendered recovery offer notification
- **WHEN** the client paints the primary "Reopen" action
- **THEN** the action background SHALL resolve to a defined theme token (`--accent-primary`)
- **AND** the action SHALL be visible and clickable

#### Scenario: No undeclared custom properties on the offer

- **GIVEN** the recovery offer component source
- **WHEN** its style bindings are inspected
- **THEN** it SHALL NOT reference `--bg-elevated` or `--accent`
- **AND** every custom property it references for a background SHALL be declared in the theme
