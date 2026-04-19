## ADDED Requirements

### Requirement: Message entryId reflects own session tree entry
The bridge extension SHALL attach, as `entryId` on the `message_end` event, the session tree entry ID of the message that was just persisted — regardless of whether the message role is `user` or `assistant`. The `message_start` event SHALL NOT carry an `entryId` field.

#### Scenario: Assistant message_end carries post-persist entryId
- **WHEN** pi core emits a `message_end` event for an assistant message
- **AND** the bridge enriches it with `entryId`
- **THEN** the `entryId` SHALL equal the session tree entry ID of the assistant message written by `sessionManager.appendMessage()` immediately after `_emit` returns

#### Scenario: User message_end carries post-persist entryId
- **WHEN** pi core emits a `message_end` event for a user message
- **AND** the bridge enriches it with `entryId`
- **THEN** the `entryId` SHALL equal the session tree entry ID of the user message written by `sessionManager.appendMessage()` immediately after `_emit` returns

#### Scenario: message_start does not carry entryId
- **WHEN** pi core emits a `message_start` event (any role)
- **THEN** the forwarded event SHALL NOT include an `entryId` field
- **AND** the bridge SHALL NOT call `getLeafId()` for `message_start` events

### Requirement: Client reducer attaches entryId from message_end for all roles
The dashboard client event-reducer SHALL read `entryId` from `message_end` events for both user and assistant roles. For user messages, whose `ChatMessage` is appended at `message_start`, the reducer SHALL retroactively attach `entryId` to the most recent user `ChatMessage` when `message_end(user)` arrives.

#### Scenario: User ChatMessage gains entryId on message_end
- **GIVEN** a user `ChatMessage` was appended to `state.messages` by the `message_start` handler (without `entryId`)
- **WHEN** the `message_end` event for that user message arrives with `data.entryId` set
- **THEN** the most recent user `ChatMessage` in `state.messages` SHALL be updated in-place to carry `entryId = data.entryId`

#### Scenario: Assistant ChatMessage carries entryId at append time
- **WHEN** the `message_end` event for an assistant message arrives with `data.entryId` set
- **THEN** the assistant `ChatMessage` appended to `state.messages` SHALL carry `entryId = data.entryId` (unchanged from prior behavior)

#### Scenario: message_start does not set user entryId
- **WHEN** the reducer processes `message_start` for a user message
- **THEN** the appended user `ChatMessage` SHALL NOT have an `entryId` set from the `message_start` event data

### Requirement: Fork from any message includes that message
The "Fork from here" action SHALL create a new session whose branch includes the message the user clicked on, for both user and assistant messages, at any position in the conversation (including the first user message).

#### Scenario: Fork from mid-conversation user message
- **GIVEN** a conversation with at least two user-assistant turns
- **WHEN** the user clicks "Fork from here" on a user message in turn 2
- **THEN** the new session SHALL contain all entries from the session root through (and including) that user message's entry
- **AND** the new session SHALL NOT contain any entries after that user message

#### Scenario: Fork from first user message
- **GIVEN** the very first user message in a session
- **WHEN** the user clicks "Fork from here" on that user message
- **THEN** the new session SHALL contain exactly that user message (plus any pre-user entries such as model_change)
- **AND** `createBranchedSessionFile` SHALL NOT throw "Entry ID not found"

#### Scenario: Fork from assistant message
- **WHEN** the user clicks "Fork from here" on an assistant message
- **THEN** the new session SHALL contain all entries from the session root through (and including) the assistant's entry
- **AND** the new session SHALL NOT contain any entries after that assistant message

#### Scenario: Fork during live streaming vs after reload — same result
- **GIVEN** two sessions with identical on-disk content, one live-streamed and one reloaded from disk
- **WHEN** the user forks from the same message index in each
- **THEN** the two resulting forked sessions SHALL contain the same entry sequence
