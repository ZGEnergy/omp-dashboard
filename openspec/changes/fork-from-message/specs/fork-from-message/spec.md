## ADDED Requirements

### Requirement: Events carry entry IDs

The `state-replay.ts` module SHALL attach the session entry's `id` as `entryId` in the `data` payload of `message_start` and `message_end` events. The extension's live event forwarding SHALL also include `entryId` when available.

#### Scenario: Replayed user message includes entryId
- **WHEN** `replayEntriesAsEvents` processes a user message entry with `id: "abc-123"`
- **THEN** the generated `message_start` event's `data` SHALL contain `entryId: "abc-123"`

#### Scenario: Replayed assistant message includes entryId
- **WHEN** `replayEntriesAsEvents` processes an assistant message entry with `id: "def-456"`
- **THEN** the generated `message_end` event's `data` SHALL contain `entryId: "def-456"`

### Requirement: ChatMessage stores entryId

The `ChatMessage` interface SHALL include an optional `entryId?: string` field. The event reducer SHALL populate it from the event's `data.entryId` when processing `message_start` (user) and `message_end` (assistant) events.

#### Scenario: User message ChatMessage has entryId
- **WHEN** the event reducer processes a `message_start` event with `data.entryId: "abc-123"`
- **THEN** the resulting ChatMessage SHALL have `entryId: "abc-123"`

#### Scenario: Assistant message ChatMessage has entryId
- **WHEN** the event reducer processes a `message_end` event with `data.entryId: "def-456"`
- **THEN** the resulting ChatMessage SHALL have `entryId: "def-456"`

#### Scenario: Missing entryId is undefined
- **WHEN** the event reducer processes a `message_start` event without `data.entryId`
- **THEN** the resulting ChatMessage SHALL have `entryId: undefined`

### Requirement: Resume session protocol supports entryId

The `ResumeSessionBrowserMessage` SHALL include an optional `entryId?: string` field. When present with `mode: "fork"`, the server SHALL fork from that specific entry rather than the session's latest entry.

#### Scenario: Fork with entryId
- **WHEN** the server receives `resume_session` with `mode: "fork"` and `entryId: "abc-123"`
- **THEN** the server SHALL create a branched session file containing only root→"abc-123" entries and fork from that file

#### Scenario: Fork without entryId (backward compatible)
- **WHEN** the server receives `resume_session` with `mode: "fork"` and no `entryId`
- **THEN** the server SHALL fork from the full session file (existing behavior)

### Requirement: Server creates branched session for entry-specific fork

When `handleResumeSession` receives a fork request with `entryId`, it SHALL use `SessionManager.open(sessionFile)` then `createBranchedSession(entryId)` to produce a pruned session file, then spawn `pi --fork` on the pruned file.

#### Scenario: Successful entry-specific fork
- **WHEN** the server processes a fork with `entryId: "abc-123"` and the entry exists in the session file
- **THEN** a new session file is created with only root→"abc-123" entries
- **AND** `pi --fork` is spawned with the new file path

#### Scenario: Invalid entryId
- **WHEN** the server processes a fork with an `entryId` that does not exist in the session file
- **THEN** the server SHALL return `resume_result` with `success: false` and an error message

### Requirement: Fork button on chat messages

ChatView SHALL display a fork button on user and assistant messages. The button SHALL appear on hover. Clicking it SHALL trigger a fork from that message's `entryId`.

#### Scenario: Fork button visible on hover
- **WHEN** the user hovers over a user or assistant message that has an `entryId`
- **THEN** a fork button SHALL be visible

#### Scenario: Fork button hidden without entryId
- **WHEN** a user or assistant message has no `entryId`
- **THEN** no fork button SHALL be shown

#### Scenario: Fork button triggers fork
- **WHEN** the user clicks the fork button on a message with `entryId: "abc-123"` in session "sess-1"
- **THEN** the client SHALL send `resume_session` with `sessionId: "sess-1"`, `mode: "fork"`, `entryId: "abc-123"`
