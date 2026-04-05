## ADDED Requirements

### Requirement: Per-project knowledge seed session
The system SHALL create a persisted Haiku session per project that digests project documentation (AGENTS.md, architecture docs, specs) and Honcho's accumulated project knowledge. The seed SHALL be stored at `~/.pi/agent/log-miner/<cwd-hash>/knowledge-seed.jsonl`.

#### Scenario: First-time seed creation
- **WHEN** a summarization pipeline runs for a project with no existing seed
- **THEN** the system creates a new Haiku session via pi SDK, prompts it to read project documentation using read-only tools, and persists the session file at the expected path

#### Scenario: Seed creation with Honcho available
- **WHEN** a seed is created and Honcho is connected
- **THEN** the system queries Honcho for the project peer's representation and top conclusions and injects them into the seed session as additional context

#### Scenario: Seed creation without Honcho
- **WHEN** a seed is created and Honcho is unavailable
- **THEN** the system creates the seed using only static project documentation files

### Requirement: Content-hash staleness detection
The system SHALL compute a content hash of source documentation files and store it alongside the seed. Before each pipeline run, the system SHALL compare the current hash against the stored hash.

#### Scenario: Docs unchanged
- **WHEN** the content hash matches the stored hash
- **THEN** the system reuses the existing seed without recreation

#### Scenario: Docs changed
- **WHEN** the content hash differs from the stored hash
- **THEN** the system recreates the seed with updated documentation

#### Scenario: Contradictions trigger staleness
- **WHEN** a pipeline run detects contradictions between new session data and the knowledge base
- **THEN** the system marks the seed as stale so it is recreated on the next run

### Requirement: Seed model fallback
The system SHALL prefer Haiku for seed creation but fall back to any available cheap model via the pi SDK's model registry if Haiku is unavailable.

#### Scenario: Haiku unavailable
- **WHEN** the user has no Anthropic API key or Haiku access
- **THEN** the system selects the cheapest available model from the model registry and uses it for seed creation
