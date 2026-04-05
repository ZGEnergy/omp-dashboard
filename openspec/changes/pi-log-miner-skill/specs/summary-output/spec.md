## ADDED Requirements

### Requirement: Markdown report generation
The system SHALL generate a categorized markdown report at `.pi/memories/session-summaries/<session-id>.md` from the final rolling summary. The report SHALL include: session metadata header, topic sections with summaries/decisions/discoveries/patterns, a surprises & contradictions section, and a knowledge-for-seed-update section when contradictions were found.

#### Scenario: Complete session analysis
- **WHEN** the pipeline finishes processing all chunks
- **THEN** a markdown file is written at the expected path containing all topic sections with their findings

#### Scenario: Session with contradictions
- **WHEN** the analysis detected contradictions
- **THEN** the markdown report includes a "Knowledge for Seed Update" section listing the contradictions and recommended updates

#### Scenario: Session with no notable findings
- **WHEN** the analysis found no surprises, contradictions, or gaps
- **THEN** the markdown report contains topic summaries but the surprises/contradictions section shows "None detected"

### Requirement: Report metadata header
The markdown report SHALL include a metadata header with: session ID, session name (if set), date, original session cost, original session duration, analysis cost, and number of chunks processed.

#### Scenario: Ended session with full metadata
- **WHEN** the analyzed session has name, cost, and duration data
- **THEN** the report header includes all fields populated

### Requirement: Report idempotency
Running the pipeline on the same session twice SHALL overwrite the existing report with a fresh analysis.

#### Scenario: Re-analysis
- **WHEN** the pipeline runs on a session that already has a summary report
- **THEN** the existing report is overwritten with the new analysis
