## ADDED Requirements

### Requirement: Auto-scroll robust to multi-batch event replay
When the chat view scrolls programmatically (on session switch in the "near bottom" branch, or when new content arrives while the user is at the bottom), the resulting `onScroll` event SHALL NOT cause the view to register that the user has scrolled away from the bottom. The auto-scroll chase SHALL continue across every subsequent `event_replay` batch until either replay completes or the user performs a real scroll gesture.

#### Scenario: Programmatic scroll-to-bottom races a replay batch
- **GIVEN** the user has switched to a session whose events are not cached on the server
- **AND** the chat view has called `scrollTo` to land at the current bottom
- **WHEN** another `event_replay` batch arrives and grows `scrollHeight` before the previous `scrollTo` has produced its `onScroll` event
- **THEN** `isNearBottom` SHALL remain true
- **AND** the floating scroll-to-bottom button SHALL NOT appear
- **AND** the next render SHALL scroll to the new bottom

#### Scenario: Real user scroll during replay still wins
- **GIVEN** event replay is in progress
- **WHEN** the user actively scrolls upward (e.g. wheel, touch, drag the scrollbar)
- **THEN** within at most 150 ms of the user's scroll, `isNearBottom` SHALL be set to false
- **AND** the floating scroll-to-bottom button SHALL appear
- **AND** subsequent replay batches SHALL NOT pull the view back to the bottom

#### Scenario: Final position is the latest message after replay
- **GIVEN** the user switched to an uncached session and did not scroll
- **WHEN** all `event_replay` batches have been processed
- **THEN** the chat view SHALL be scrolled to the latest message
- **AND** the floating scroll-to-bottom button SHALL NOT be visible
