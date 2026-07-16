## MODIFIED Requirements

### Requirement: Sticky bottom and scroll-to-bottom control

ChatView SHALL keep a stick-to-bottom latch: near-bottom follows new content;
scroll-up escapes; the scroll-to-bottom control re-arms follow. Multi-batch
`event_replay` SHALL not leave the user permanently stuck mid-list after a cold
hydrate when they did not deliberately escape.

#### Scenario: Escape while streaming

- **WHEN** the user scrolls up away from the bottom during live content
- **THEN** new content SHALL NOT yank the viewport to the bottom
- **AND** the scroll-to-bottom control SHALL be visible

#### Scenario: Re-arm at bottom

- **WHEN** the user scrolls back within the near-bottom threshold
- **THEN** stick-to-bottom SHALL re-arm and chase new content

### Requirement: Post-hydrate bottom pin

When history loading completes for the selected session, ChatView SHALL pin to
the true bottom once if the user has not escaped during that hydrate. This
applies even when `sessionId` did not change (wipe→rebuild / multi-batch cold
open).

#### Scenario: Cold open lands at bottom

- **WHEN** a session opens empty with `loadingHistory` true and then receives
  its first full history window with the user not scrolling away
- **THEN** after `loadingHistory` becomes false the viewport SHALL be near the
  bottom
- **AND** the scroll-to-bottom control SHALL be hidden

#### Scenario: Same-session wipe rebuild

- **WHEN** the same `sessionId` is wiped to empty and rebuilt from replay without
  a session switch
- **AND** the user has not deliberately escaped during rebuild
- **THEN** the viewport SHALL end near the bottom of the rebuilt transcript

#### Scenario: User escape during hydrate is respected

- **WHEN** the user wheels or touch-scrolls away from the bottom while history
  is still loading
- **THEN** post-hydrate pin SHALL NOT force them back to the bottom

### Requirement: Load-older does not fight scroll lock

#### Scenario: Prepend keeps anchor

- **WHEN** older history is prepended while the user is at the top of the current
  window
- **THEN** the first visible row before prepend SHALL remain the first visible
  row after prepend (within normal layout tolerance)
- **AND** stick-to-bottom SHALL remain disarmed
