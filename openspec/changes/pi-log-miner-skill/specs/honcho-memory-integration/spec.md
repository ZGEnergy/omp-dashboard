## ADDED Requirements

### Requirement: Two-peer model per workspace
The system SHALL create one Honcho workspace per project directory (keyed by cwd). Each workspace SHALL have two peers: `project` (representing the codebase) and `developer` (representing the human user).

#### Scenario: First pipeline run for a project
- **WHEN** the pipeline runs for a project with no existing Honcho workspace
- **THEN** the system creates a workspace and the `project` peer

#### Scenario: Developer peer from community extension
- **WHEN** the `pi-honcho-memory` community extension has already created a developer peer in the workspace
- **THEN** the system reads from the existing developer peer but does not write to it

### Requirement: Conclusion storage with metadata
The system SHALL store extracted knowledge as Honcho Conclusions on the `project` peer with metadata fields: `category` (decision/discovery/pattern/gap/error), `importance` (low/medium/high/critical), `topic`, `sessionId`, and `sourceRound`.

#### Scenario: Decision extracted
- **WHEN** the pipeline extracts a decision from a chunk
- **THEN** a Conclusion is created with `category: "decision"` and the relevant metadata

#### Scenario: Contradiction extracted
- **WHEN** the pipeline detects a contradiction
- **THEN** a Conclusion is created with `category: "discovery"`, `importance: "critical"`, and the contradiction content

### Requirement: Semantic search via conclusions
The system SHALL support querying Honcho conclusions using natural language via `conclusions.query()`.

#### Scenario: Knowledge query
- **WHEN** the seed creation process queries "key architectural decisions and patterns"
- **THEN** Honcho returns semantically relevant conclusions regardless of their category tags

### Requirement: Knowledge feedback loop
During knowledge seed creation, the system SHALL query Honcho for the project peer's representation and top conclusions and inject them into the seed session context.

#### Scenario: Seed enriched by prior mining runs
- **WHEN** a knowledge seed is created and Honcho contains conclusions from 5 previous mining runs
- **THEN** the seed session receives the project peer's synthesized representation and top-ranked conclusions as context

### Requirement: Honcho session per analysis
Each pi session analysis SHALL be tracked as a Honcho session. Chunk analysis results SHALL be stored as messages in the Honcho session so Honcho's built-in summarizer can generate meta-summaries.

#### Scenario: Pipeline creates Honcho session
- **WHEN** the pipeline starts analyzing a pi session
- **THEN** a new Honcho session is created in the workspace linked to the analysis

### Requirement: Graceful degradation without Honcho
The system SHALL function identically without Honcho connectivity. When Honcho is unavailable, the pipeline SHALL skip conclusion storage, skip representation queries, and produce only markdown output.

#### Scenario: Honcho unavailable
- **WHEN** Honcho is not reachable and the pipeline runs
- **THEN** the pipeline processes all chunks, generates the markdown report, and logs that Honcho storage was skipped
