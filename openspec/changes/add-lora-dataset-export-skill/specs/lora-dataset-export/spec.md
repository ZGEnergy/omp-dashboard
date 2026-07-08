# lora-dataset-export — delta

## ADDED Requirements

### Requirement: On-demand invocation only
The LoRA dataset export SHALL be invoked deliberately via the `build-lora-dataset` skill
(optionally with a subagent). It SHALL NOT be wired to any session-lifecycle trigger,
watcher, or cron. On invocation it SHALL prompt the operator for scope, quality
threshold, mixture caps, and target context length before producing any output.

#### Scenario: Skill prompts for choices before exporting
- **WHEN** the operator invokes `build-lora-dataset`
- **THEN** the skill SHALL ask for scope (projects / date range / models), quality threshold, mixture caps, and context length
- **AND** it SHALL NOT begin export until those choices are supplied

### Requirement: Quality filter uses the terminal-state success detector
Example selection SHALL reuse `episodeVerifiedGood`: keep trajectories whose terminal
state is verified-good and keep error→same-tool→fix recovery episodes; drop
error-at-terminal-with-no-recovery and correction-terminated tails.

#### Scenario: Recovery kept, failed tail dropped
- **WHEN** the corpus contains (a) an episode that errored then fixed the same tool and ended green, and (b) an episode that ended on an unresolved tool error
- **THEN** (a) SHALL be included and (b) SHALL be excluded

#### Scenario: Correction-terminated tail dropped
- **WHEN** a user turn matching the correction lexicon immediately follows an assistant action at the episode terminal
- **THEN** that trailing action SHALL be excluded from the dataset

### Requirement: Assistant-only loss masking
Emitted examples SHALL carry a `loss_mask` such that loss is computed ONLY over
assistant-authored tokens (text + tool_calls). System, user, and tool tokens SHALL be
masked. The exporter SHALL assert the mask and fail loudly on a violation.

#### Scenario: User and tool spans masked
- **WHEN** an example contains system, user, assistant, and tool messages
- **THEN** only the assistant text and tool_calls SHALL be unmasked in `loss_mask`
- **AND** a test that plants an unmasked user/tool token SHALL fail the build

### Requirement: Split by session, never by turn
The `train/val/test` split SHALL be performed at session granularity. No `sessionId`
SHALL appear in more than one split.

#### Scenario: No session leaks across splits
- **WHEN** the dataset is split
- **THEN** for every `sessionId`, all its examples SHALL reside in exactly one of train/val/test

### Requirement: Mandatory scrub before dataset write
Every example SHALL pass the shared `scrub.ts` + `secretScan` gate before entering the
dataset. An example that still matches a secret pattern after scrubbing SHALL be dropped.

#### Scenario: Planted secret drops the example
- **WHEN** a session turn contains an `auth.json`-shaped token
- **THEN** the affected example SHALL be scrubbed, and if a secret survives, dropped and counted — no un-redacted secret SHALL appear in the exported dataset

### Requirement: Deterministic stats report
The export SHALL emit a stats report alongside the dataset: example counts per split,
tool/task-type distribution, length histogram, dedup ratio, and success-label counts.

#### Scenario: Report accompanies the dataset
- **WHEN** an export completes
- **THEN** a stats report SHALL be written next to the dataset file with the fields above
