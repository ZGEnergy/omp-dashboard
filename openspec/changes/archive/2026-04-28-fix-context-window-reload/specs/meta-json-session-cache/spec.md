## ADDED Requirements

### Requirement: Persisted contextWindow is authoritative on stale-cache re-extract
The system SHALL preserve the previously persisted `contextWindow` in `.meta.json` whenever stale-cache re-extraction would otherwise overwrite it with a value derived from `.jsonl` parsing or model-id inference. The persisted value MAY only be replaced when the active model changes (the previously persisted value no longer applies) or when no value was previously persisted.

Rationale: pi's persisted `.jsonl` contains no `turn_end` or `contextUsage` entries, so any value `extractSessionStats` returns for `contextWindow` is necessarily an `inferContextWindow(modelId)` heuristic that pins Claude to `200_000` and ignores 1M variants. The persisted `meta.contextWindow` came from a live `turn_end` event carrying the LLM's reported value and is the only reliable source.

#### Scenario: Stale cache re-extract preserves persisted contextWindow when model unchanged
- **GIVEN** a `.meta.json` with `model: "anthropic/claude-sonnet-4-20250514"` and `contextWindow: 1_000_000`
- **AND** the `.jsonl` mtime is newer than `meta.cachedAt` (forcing re-extract)
- **AND** `extractSessionStats` returns the same model with an inferred `contextWindow: 200_000`
- **WHEN** the scanner merges stats into meta
- **THEN** the resulting `contextWindow` SHALL be `1_000_000`
- **AND** the persisted `.meta.json` SHALL still report `contextWindow: 1_000_000`

#### Scenario: Stale cache re-extract adopts inferred contextWindow when model changes
- **GIVEN** a `.meta.json` with `model: "openai/gpt-4o"` and `contextWindow: 128_000`
- **AND** the `.jsonl` mtime is newer than `meta.cachedAt`
- **AND** `extractSessionStats` returns a different model `"anthropic/claude-sonnet-4-20250514"` with `contextWindow: 200_000`
- **WHEN** the scanner merges stats into meta
- **THEN** the resulting `model` SHALL be `"anthropic/claude-sonnet-4-20250514"`
- **AND** the resulting `contextWindow` SHALL be `200_000`

#### Scenario: First-extract path infers contextWindow when no meta exists
- **GIVEN** a `.jsonl` file with no corresponding `.meta.json`
- **WHEN** the scanner falls back to `.jsonl` parsing and writes a fresh `.meta.json`
- **THEN** `contextWindow` SHALL be the value returned by `extractSessionStats` (which is `inferContextWindow(model)`)
