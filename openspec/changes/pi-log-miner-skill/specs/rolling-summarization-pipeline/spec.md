## ADDED Requirements

### Requirement: Fork-per-chunk orchestration
The system SHALL process chunks sequentially by forking the knowledge seed session for each chunk. Each fork SHALL receive the accumulated rolling summary and the current chunk as a structured prompt. After extracting the structured JSON response, the fork session file SHALL be deleted.

#### Scenario: Processing a chunk
- **WHEN** the pipeline processes chunk N
- **THEN** the system forks the knowledge seed, sends a prompt containing the rolling summary and chunk content, parses the JSON response, updates the rolling summary, and deletes the fork session file

#### Scenario: Fork cleanup on error
- **WHEN** a fork session throws an error during processing
- **THEN** the system deletes the fork session file in a finally block and continues to the next chunk

#### Scenario: All chunks processed
- **WHEN** all chunks have been processed
- **THEN** no fork session files remain on disk

### Requirement: Structured analysis prompt
Each fork SHALL receive a prompt that includes: (1) the project knowledge context (inherited from the seed), (2) the current rolling summary, (3) the chunk content, and (4) instructions to return a JSON object with fields: `topic`, `topicChanged`, `summary`, `surprises`, `contradictions`, `gaps_filled`, `decisions`, `patterns`, `importance`.

#### Scenario: Chunk with topic change
- **WHEN** the chunk heuristics indicate `topicChanged: true`
- **THEN** the prompt instructs the model to confirm or override the topic change and provide a new topic label

#### Scenario: First chunk (empty rolling summary)
- **WHEN** the rolling summary is empty (first chunk)
- **THEN** the prompt omits the rolling summary section and instructs the model to establish the initial topic

### Requirement: Three-way surprise/contradiction/gap detection
The analysis prompt SHALL instruct the model to compare the chunk against both the project knowledge (from the seed context) and the accumulated rolling summary to detect: surprises (unexpected findings), contradictions (conflicts with known architecture), and gaps (new knowledge not in base docs).

#### Scenario: Contradiction detected
- **WHEN** a chunk contains information that conflicts with known architecture (e.g., "auth is middleware" vs. chunk shows per-route auth)
- **THEN** the model returns at least one item in `contradictions` and the system marks the knowledge seed as stale

#### Scenario: Gap detected
- **WHEN** a chunk reveals knowledge not present in the base documentation or rolling summary
- **THEN** the model returns at least one item in `gaps_filled`

#### Scenario: No findings
- **WHEN** a chunk contains routine work consistent with known patterns
- **THEN** the model returns empty arrays for `surprises`, `contradictions`, and `gaps_filled`

### Requirement: Topic-organized rolling summary accumulation
The rolling summary SHALL be organized as an array of topic sections. When the model confirms a topic change, a new section is created. Otherwise, findings append to the current topic section.

#### Scenario: New topic detected
- **WHEN** the model returns `topicChanged: true` with a new topic label
- **THEN** a new topic section is created in the rolling summary with the returned topic label

#### Scenario: Same topic continues
- **WHEN** the model returns `topicChanged: false`
- **THEN** the findings (summary, decisions, patterns, etc.) append to the most recent topic section
