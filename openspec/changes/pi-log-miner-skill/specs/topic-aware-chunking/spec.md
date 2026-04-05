## ADDED Requirements

### Requirement: Agent-round grouping
The system SHALL parse JSONL session files using the existing `session-file-reader.ts` and group entries into agent rounds. An agent round is defined as one user prompt followed by all assistant turns and tool results until the next user prompt or session end.

#### Scenario: Normal session with multiple rounds
- **WHEN** a session file contains 5 user prompts with interleaved assistant responses and tool calls
- **THEN** the system produces 5 chunks, each containing one user prompt and all its associated assistant/tool entries

#### Scenario: Session with compaction entries
- **WHEN** a session file contains compaction entries
- **THEN** the system includes the compaction summary as context but does not create a separate chunk for it

### Requirement: Hybrid topic boundary detection
The system SHALL detect topic boundaries using heuristic signals before LLM analysis. Each chunk SHALL carry a `topicChanged` flag based on these heuristics.

#### Scenario: File cluster disjointness
- **WHEN** the set of files touched in round N is completely disjoint from the files touched in round N-1
- **THEN** the system marks `topicChanged: true` on the chunk for round N

#### Scenario: Time gap detection
- **WHEN** the time gap between the last entry of round N-1 and the first entry of round N exceeds 10 minutes
- **THEN** the system marks `topicChanged: true` on the chunk for round N

#### Scenario: User prompt keywords
- **WHEN** the user prompt in round N contains explicit topic-switch phrases (e.g., "now let's", "switch to", "moving on to", "next:")
- **THEN** the system marks `topicChanged: true` on the chunk for round N

#### Scenario: Tool pattern shift
- **WHEN** round N-1 was predominantly read-heavy and round N is predominantly edit/write-heavy (or vice versa)
- **THEN** the system marks `topicChanged: true` on the chunk for round N

### Requirement: Chunk content extraction
Each chunk SHALL contain extracted text content from user prompts, assistant responses (text blocks only), and tool call names/arguments. File content dumps and base64 image data SHALL be excluded to keep chunk size manageable.

#### Scenario: Assistant response with tool calls
- **WHEN** an assistant message contains text blocks and tool call blocks
- **THEN** the chunk includes the text content and tool call names/arguments but not full tool result outputs exceeding 500 characters

#### Scenario: Large tool results
- **WHEN** a tool result contains more than 500 characters
- **THEN** the chunk includes only the first 500 characters followed by a truncation marker
