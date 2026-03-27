## ADDED Requirements

### Requirement: Full-card background pulse for working sessions
Session cards SHALL display a slow pulsing background tint animation when the session is in `streaming` status or has `resuming` set to true. The animation SHALL cycle the card's background color between transparent and a faint amber tint (`rgba(234, 179, 8, 0.06)`) over a 3-second ease-in-out infinite loop using a `card-working-pulse` CSS keyframe defined in `index.css`.

#### Scenario: Streaming session card pulses
- **WHEN** a session card is rendered with `session.status === "streaming"`
- **THEN** the card `<li>` element SHALL have the `card-working-pulse` animation applied

#### Scenario: Resuming session card pulses
- **WHEN** a session card is rendered with `session.resuming === true`
- **THEN** the card `<li>` element SHALL have the `card-working-pulse` animation applied

#### Scenario: Idle session card does not pulse
- **WHEN** a session card is rendered with `session.status === "idle"` and `session.resuming` is falsy
- **THEN** the card `<li>` element SHALL NOT have the `card-working-pulse` animation

#### Scenario: Ended session card does not pulse
- **WHEN** a session card is rendered with `session.status === "ended"`
- **THEN** the card `<li>` element SHALL NOT have the `card-working-pulse` animation
