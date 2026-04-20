## ADDED Requirements

### Requirement: Assistant message entryId reflects own session entry
The bridge extension SHALL attach the assistant message's own session tree entry ID as `entryId` on `message_end` events, not the previous leaf's entry ID.

#### Scenario: Assistant message_end carries correct entryId
- **WHEN** pi core emits a `message_end` event for an assistant message
- **AND** the bridge enriches it with `entryId` via `getLeafId()`
- **THEN** the `entryId` SHALL be the entry ID of the assistant's own session tree entry (written by `appendMessage` after the event)

#### Scenario: message_start entryId unchanged
- **WHEN** pi core emits a `message_start` event
- **THEN** the `entryId` SHALL be captured immediately via `getLeafId()` (current behavior preserved)

### Requirement: Fork from assistant message includes that message
The "fork from here" action on an assistant message SHALL create a new session that includes the assistant message the user clicked on.

#### Scenario: Fork from assistant message
- **WHEN** a user clicks "Fork from here" on an assistant message
- **AND** the assistant message has `entryId` pointing to its own session tree entry
- **THEN** `createBranchedSessionFile` SHALL prune the session tree to include the path from root through the assistant's entry
- **AND** the new session SHALL contain the assistant message the user forked from

#### Scenario: Fork from user message unchanged
- **WHEN** a user clicks "Fork from here" on a user message
- **THEN** the fork SHALL include the path up to and including that user message's entry (existing behavior preserved)
