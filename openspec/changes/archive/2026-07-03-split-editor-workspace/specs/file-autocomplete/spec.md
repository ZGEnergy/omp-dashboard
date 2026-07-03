# file-autocomplete — delta

## MODIFIED Requirements

### Requirement: Debounced file search requests
The system SHALL debounce `list_files` requests at 150ms to avoid flooding the server
while the user types a query after `@`. The system SHALL additionally require a
**minimum leaf length of 3 characters** before issuing a walk-backed `list_files`
request for a non-empty query. A bare `@` (empty query) SHALL still request the
top-level entry listing; a leaf of 1–2 characters SHALL NOT issue a walk-backed request
(the dropdown shows the last valid result or nothing).

#### Scenario: Rapid typing after @
- **WHEN** the user types `@src/ser` rapidly (each character within 150ms)
- **THEN** the system SHALL send only one `list_files` request with query `src/ser`

#### Scenario: Pause during typing
- **WHEN** the user types `@src`, pauses 200ms, then types `/db`
- **THEN** the system SHALL send two `list_files` requests: one with `src` and one with `src/db`

#### Scenario: Leaf below minimum length does not walk
- **WHEN** the user types `@ab` (a 2-character leaf with no slash)
- **THEN** the system SHALL NOT issue a walk-backed `list_files` request
- **AND** typing the third character `@abc` SHALL issue the request

#### Scenario: Bare @ still lists top-level entries
- **WHEN** the user types a bare `@` (empty query)
- **THEN** the system SHALL request the top-level entry listing (minimum-length guard does not apply to the empty query)

## ADDED Requirements

### Requirement: File-mention traversal SHALL be `.gitignore`-aware

The bridge `searchFiles` traversal SHALL skip directories and files matched by the
session's `.gitignore` (in addition to the hardcoded `IGNORE_DIRS` set), so the
traversal budget is not consumed by ignored trees (build output, caches, vendored
dependencies). `.gitignore` parsing SHALL be best-effort: a missing or malformed
`.gitignore` SHALL NOT break the walk.

#### Scenario: Ignored directory does not consume budget
- **GIVEN** the session `.gitignore` ignores `coverage/`
- **WHEN** the user searches `@report`
- **THEN** the walk SHALL NOT descend into `coverage/`
- **AND** the visit budget is available for non-ignored source trees

#### Scenario: Missing .gitignore does not break search
- **GIVEN** the session `cwd` has no `.gitignore`
- **WHEN** the user searches `@foo`
- **THEN** the walk proceeds using `IGNORE_DIRS` only, without error

### Requirement: File-mention completeness budget SHALL cover large repositories

The traversal budget (`MAX_VISITS`) and depth guard SHALL be tuned so that, on a
representative large monorepo, a file matching the query is not silently dropped
because the walk horizon was exhausted before reaching its subtree. Combined with
`.gitignore`-aware pruning, the softened budget SHALL surface matches in later
top-level subtrees that the previous fixed `MAX_VISITS = 4000` / `depth ≤ 6` bounds
excluded.

#### Scenario: Match in a late top-level subtree is surfaced
- **GIVEN** a repository whose entry count within the old budget excluded a later
  top-level directory `zztools/`
- **WHEN** the user searches `@zzhelper` and `zztools/zzhelper.ts` exists
- **THEN** `zztools/zzhelper.ts` SHALL appear in the ranked results
- **AND** it SHALL NOT be dropped by the traversal horizon

### Requirement: File-mention leaf SHALL support an optional regexp mode

`searchFiles` SHALL accept an optional regexp interpretation of the leaf query. When
regexp mode is active the leaf SHALL be matched as a regular expression against
candidate basenames/paths; when inactive the existing substring/ranking behaviour is
unchanged. An invalid regexp SHALL degrade gracefully to substring matching rather than
erroring.

#### Scenario: Regexp leaf matches by pattern
- **GIVEN** regexp mode is active
- **WHEN** the user searches `@foo.*test`
- **THEN** files whose path matches the pattern `foo.*test` SHALL be returned

#### Scenario: Invalid regexp falls back to substring
- **GIVEN** regexp mode is active
- **WHEN** the user types an incomplete pattern `@foo(`
- **THEN** the search SHALL fall back to substring matching for `foo(`
- **AND** SHALL NOT throw or return an error to the client
