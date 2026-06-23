# documentation-index — delta

## ADDED Requirements

### Requirement: In-place AGENTS.md tree is the canonical per-file record
The per-file documentation index SHALL live in a hierarchy of `AGENTS.md` files
co-located with the code they describe, NOT in any centralized
`docs/file-index*.md`. The root `AGENTS.md` SHALL hold global rules plus a
top-level pointer map (area → AGENTS.md path) and SHALL NOT contain a per-file
index. Child `AGENTS.md` SHALL carry the per-file index for files in their scope
using the existing row schema `` | `<path>` | <purpose> | `` in path-alphabetical
order and caveman style. The legacy `docs/file-index.md` and all
`docs/file-index-<area>.md` splits SHALL be removed.

#### Scenario: Root AGENTS.md holds no file rows
- **WHEN** the root `AGENTS.md` is inspected after migration
- **THEN** it SHALL contain a top-level pointer map of area → child AGENTS.md path
- **AND** it SHALL contain zero per-file index rows
- **AND** `docs/file-index.md` and every `docs/file-index-<area>.md` SHALL NOT exist

#### Scenario: A documented file's row lives in the nearest AGENTS.md
- **WHEN** an architecturally significant file at `<path>` is looked up
- **THEN** exactly one `AGENTS.md` at or above `<path>` SHALL contain a row for it
- **AND** that row SHALL use the `` | `<path>` | <purpose> | `` schema in caveman style

### Requirement: Placement is per meaningful sub-area, bounded in size
`AGENTS.md` files SHALL be placed per meaningful sub-area, not one per directory.
Every top-level package with documented files SHALL have a package-root
`AGENTS.md`. A deeper child `AGENTS.md` SHALL be created only when the subdir is a
coherent concern AND owns enough documented files to warrant local docs. No single
`AGENTS.md` SHALL exceed roughly 40–50 file rows; an over-cap file SHALL be split
into a deeper sub-area `AGENTS.md`. Files in directories below the deepest
`AGENTS.md` SHALL be documented by the nearest ancestor `AGENTS.md`.

#### Scenario: Trivial directory inherits ancestor docs
- **WHEN** a directory has no `AGENTS.md` of its own
- **THEN** its files SHALL be documented by the nearest ancestor `AGENTS.md`
- **AND** no empty/placeholder `AGENTS.md` SHALL be created for it

#### Scenario: Over-cap file is split
- **WHEN** a sub-area's `AGENTS.md` would exceed ~50 rows
- **THEN** a deeper child `AGENTS.md` SHALL be created to hold a coherent subset
- **AND** the parent SHALL add a pointer line to the new child

### Requirement: Large source files use a companion doc
A large source file SHALL be documented in a sibling `<file>.agent.md` companion rather than inline in its directory `AGENTS.md`. Large is gated on the source file's own size/LOC (plus long contract, many invariants, or change history) such that inlining its detail would bloat the directory `AGENTS.md`; small files SHALL stay inline as ordinary rows. The directory `AGENTS.md` row for a large file SHALL be reduced to a one-line summary plus a link to its `.agent.md` companion. Companion docs SHALL follow caveman style.

#### Scenario: Large file documented via companion
- **WHEN** a large source file `Foo` requires detailed documentation
- **THEN** a sibling `Foo.agent.md` companion SHALL hold the detail
- **AND** the directory `AGENTS.md` row for `Foo` SHALL be a one-line summary linking to it
- **AND** the directory `AGENTS.md` SHALL NOT inline the full detail

#### Scenario: Small file stays inline
- **WHEN** a small source file requires only a brief description
- **THEN** it SHALL be documented as an ordinary inline row in its directory `AGENTS.md`
- **AND** no `.agent.md` companion SHALL be created for it

### Requirement: Walk-the-tree edit protocol
Before editing a file, the agent SHALL walk the `AGENTS.md` tree from root to the
nearest `AGENTS.md` for that file and read the local rules and the file's row
(including any linked companion doc). After a meaningful change the agent SHALL
update the nearest `AGENTS.md`: amend the row, add a row for a new file (or a
companion doc + linking row for a large new file), or create a child `AGENTS.md`
plus a parent pointer for a new sub-area. Cross-area "where is X" sweeps SHALL be
delegated to a subagent that enumerates `AGENTS.md` via `find` and returns only the
relevant rows.

#### Scenario: New file gets a row
- **WHEN** a new architecturally significant file is added at `<path>`
- **THEN** a row for `<path>` SHALL be added to the nearest `AGENTS.md` in
  path-alphabetical order
- **AND** no row SHALL be added to the root `AGENTS.md`

#### Scenario: New sub-area gets a child AGENTS.md
- **WHEN** a new coherent sub-area with enough documented files is created
- **THEN** a child `AGENTS.md` SHALL be created in that sub-area
- **AND** the parent `AGENTS.md` SHALL gain a pointer to it
- **AND** the root top-level pointer map SHALL be updated if it is a new area

#### Scenario: Cross-area lookup is delegated
- **WHEN** the agent needs to locate code across multiple areas
- **THEN** it SHALL delegate to a subagent that runs `find . -name AGENTS.md` and greps
- **AND** the subagent SHALL return only the ≤10 relevant rows, not whole files

### Requirement: References point at the DOX tree, not the old splits
All repository documentation and skills that referenced `docs/file-index*.md` SHALL
be updated to reference the in-place `AGENTS.md` tree and the walk-the-tree
protocol. After migration, a search for `file-index` across `AGENTS.md`,
`README.md`, `docs/`, and `.pi/` SHALL return no hits outside this change folder.

#### Scenario: No dangling file-index references remain
- **WHEN** `grep -rn 'file-index' AGENTS.md README.md docs .pi` is run after migration
- **THEN** it SHALL return zero matches (excluding `openspec/changes/`)
