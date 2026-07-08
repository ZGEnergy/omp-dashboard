# skill-frontmatter-validity Specification

## Purpose
Guarantee every `SKILL.md` in the repository has YAML-parseable frontmatter with a non-empty `description`, so skills load in pi instead of failing silently at startup. Enforced by an automated guard that runs in the test suite / CI.

## ADDED Requirements

### Requirement: Skill frontmatter parses as valid YAML

Every `SKILL.md` in the repo SHALL have a leading `---`-fenced frontmatter block that parses as valid YAML (excluding `node_modules`, build output, and worktree checkouts).

#### Scenario: All skill manifests parse

- **WHEN** the guard globs every `**/SKILL.md` under the repo (excluding `node_modules`, `dist`, and worktrees)
- **THEN** each file's `---`-fenced frontmatter SHALL parse without a YAML error.

#### Scenario: Description-with-colon values are quoted

- **WHEN** a skill `description` value contains a `colon-space` sequence (e.g. `Triggers: "…"`)
- **THEN** the value SHALL be a quoted or block scalar so the parser does not read it as a nested mapping.

### Requirement: Skill frontmatter declares a non-empty description

Every `SKILL.md` frontmatter SHALL contain a `description` key whose value is a non-empty string after trimming.

#### Scenario: Missing or empty description fails the guard

- **WHEN** a `SKILL.md` frontmatter omits `description` or sets it to an empty/whitespace string
- **THEN** the guard SHALL fail and name the offending file.

### Requirement: The three previously-broken skills load

The skills `ship-change`, `frontend-mockup-loop`, and `anti-slop-frontend` SHALL have frontmatter that parses as valid YAML with their original description wording preserved (only quoting/escaping added).

#### Scenario: Formerly-failing skills now parse

- **WHEN** the guard parses `.pi/skills/ship-change/SKILL.md`, `packages/mockup-loop/.pi/skills/frontend-mockup-loop/SKILL.md`, and `packages/anti-slop/.pi/skills/anti-slop-frontend/SKILL.md`
- **THEN** each SHALL parse successfully with a non-empty `description`
- **AND** the human-readable wording of each description SHALL be unchanged from before the fix.
