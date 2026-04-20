## ADDED Requirements

### Requirement: Streaming/resuming cards show horizontally drifting diagonal stripes layered with a breathing pulse
Session cards in `streaming` or `resuming` state (carrying the `card-working-pulse` CSS class) SHALL display two simultaneous, independent visual effects:

1. A **45° barber-pole stripe pattern** in low-alpha amber, drifting **purely horizontally** by translating `background-position` linearly along the X axis only. (Translation along the (1,1) diagonal is along the stripe direction itself — pattern-invariant — so it produces zero perceived motion. Horizontal scrolling cuts across the stripes for visible drift.)
2. A **breathing pulse** in which the overall element opacity oscillates smoothly, preserving the "alive" feel of the previous animation.

The stripe `background-size` SHALL be set to exactly one diagonal pattern period (`28.2843px × 28.2843px`, i.e. `20√2`) so tiles repeat seamlessly without visible seams. The animation SHALL translate by an integer number of full periods (e.g. `113.1371px = 4 × 20√2`) for a perfectly seamless loop. The two animations MAY run at the same period (3s/3s) or different periods; tuning is implementation-level.

The combined intensity SHALL remain ambient (low alpha, low contrast) so that streaming cards are clearly distinguishable from idle cards without being visually loud.

The CSS class name SHALL remain `card-working-pulse` so existing component logic and tests continue to apply it on `status === "streaming"` or `resuming`.

#### Scenario: Streaming session card has stripes and pulse
- **WHEN** a session enters `streaming` status
- **THEN** the rendered card element has the `card-working-pulse` class
- **AND** the computed background includes a repeating linear gradient at 45°
- **AND** an animation translates `background-position` along the X axis (horizontal drift only)
- **AND** an animation oscillates the element opacity

#### Scenario: Stripe tile size matches the diagonal pattern period
- **WHEN** the streaming card renders
- **THEN** `background-size` equals one full diagonal period (`20√2 px ≈ 28.2843px`) in both x and y
- **AND** the animation end position is an integer multiple of that period along the scroll axis (so the loop is seamless)

#### Scenario: Resuming session card uses the same animation
- **WHEN** a session is in `resuming` state
- **THEN** the card has the `card-working-pulse` class with the same combined stripe + pulse animation

#### Scenario: Idle session card has neither stripes nor pulse
- **WHEN** a session is in `idle` status
- **THEN** the card does NOT have the `card-working-pulse` class
- **AND** no stripe pattern or opacity animation is applied

### Requirement: Reduced-motion users get a static visual indicator
When the user's environment reports `prefers-reduced-motion: reduce`, the streaming/resuming card SHALL retain a clearly visible static striped + tinted background but SHALL NOT animate stripe drift or opacity pulsing.

#### Scenario: Reduced motion disables animations but preserves the state cue
- **WHEN** the user has `prefers-reduced-motion: reduce` set
- **AND** a session card has the `card-working-pulse` class
- **THEN** no animations run on the element
- **AND** the static repeating diagonal stripe background is still rendered so the streaming state remains visually distinct from idle

### Requirement: ask_user (input-pending) cards remain pulse-only
The existing `card-input-pulse` class used for sessions awaiting user input via `ask_user` SHALL continue to use only the breathing-pulse animation in purple, with NO diagonal stripes. This contrast SHALL be preserved so that "machine working" (stripes + pulse) is visually distinct from "machine waiting on you" (pulse only).

#### Scenario: ask_user card uses pulse only
- **WHEN** a session is awaiting user input via `ask_user`
- **THEN** the card has the `card-input-pulse` class
- **AND** the rendered background does NOT include a repeating linear gradient
- **AND** only an opacity / background-color pulse animation is applied
