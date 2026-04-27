## MODIFIED Requirements

### Requirement: Directory browse API
The server SHALL expose `GET /api/browse?path=<dir>&q=<query>&detect=<0|1>` (localhost-only) that returns directory entries for the given path. The response SHALL include `{ success: true, data: { entries: Array<{ name, path, isGit?, isPi? }>, parent: string | null, current: string } }`. Only directories SHALL be listed (no files). Hidden directories (names starting with `.`) SHALL be excluded. If `path` is omitted, it SHALL default to the user's home directory. The entry limit SHALL be 200, applied AFTER filtering and ranking so best matches are never truncated.

When `detect` is omitted, empty, or any value other than `1`, the server SHALL skip per-entry `.git` / `.pi` detection and SHALL omit the `isGit` and `isPi` fields from each entry. The default response is therefore a single-`readdir` enumeration with no per-entry filesystem probes.

When `detect=1`, the server SHALL probe each returned entry's `.git` and `.pi` paths (using `fs.access`-style detection — any error including ENOENT, EACCES, ELOOP, or race-on-deletion SHALL map to `false`) and SHALL populate `isGit` and `isPi` accordingly on every entry.

When `q` is omitted or empty, entries SHALL be sorted alphabetically (case-insensitive).

When `q` is provided, entries SHALL be filtered case-insensitively by substring on `name` and SHALL be ranked into the following tiers, alphabetical within each tier:
- **Tier 0** — exact case-insensitive match of `name` against `q`.
- **Tier 1** — `name` starts with `q` (case-insensitive).
- **Tier 2** — `q` occurs in `name` at a word boundary (preceded by the start of the string or by one of `-`, `_`, `.`, ` `, `/`), case-insensitive.
- **Tier 3** — `q` occurs anywhere in `name` (case-insensitive).

#### Scenario: Browse valid directory without detection
- **WHEN** a GET request is made to `/api/browse?path=/home/user/projects` (no `detect`)
- **THEN** the server SHALL return a list of subdirectories
- **AND** each entry SHALL omit the `isGit` and `isPi` fields
- **AND** no per-entry `.git` / `.pi` filesystem probe SHALL be performed

#### Scenario: Browse valid directory with detection enabled
- **WHEN** a GET request is made to `/api/browse?path=/home/user/projects&detect=1`
- **THEN** the server SHALL return a list of subdirectories
- **AND** each entry SHALL include boolean `isGit` and `isPi` fields reflecting the presence of `.git` and `.pi` directories or files at that entry's path

#### Scenario: detect parameter accepts only `1` as truthy
- **WHEN** a GET request is made with `detect=true`, `detect=yes`, or any value other than `1`
- **THEN** the server SHALL behave as if `detect` were omitted (no probe, fields omitted)

#### Scenario: detect probe failures surface as false
- **WHEN** `detect=1` is requested and an entry's `.git` or `.pi` lookup fails for any reason (ENOENT, EACCES, ELOOP, or the entry is removed mid-request)
- **THEN** the corresponding flag SHALL be `false` for that entry
- **AND** the request SHALL still succeed

#### Scenario: Browse home directory (default)
- **WHEN** a GET request is made to `/api/browse` without a path parameter
- **THEN** the server SHALL return entries for the user's home directory (`os.homedir()`)

#### Scenario: Browse non-existent directory
- **WHEN** a GET request is made with a path that does not exist
- **THEN** the server SHALL return `{ success: false, error: "directory not found" }`

#### Scenario: Parent path included
- **WHEN** a directory listing is returned for `/home/user/projects`
- **THEN** the `parent` field SHALL be `/home/user`

#### Scenario: Root directory has no parent
- **WHEN** a directory listing is returned for `/`
- **THEN** the `parent` field SHALL be `null`

#### Scenario: Remote access blocked
- **WHEN** a GET request originates from a non-loopback address
- **THEN** the server SHALL return `{ success: false, error: "localhost only" }`

#### Scenario: Hidden directories excluded
- **WHEN** a directory contains subdirectories like `.config`, `.cache`, `projects`
- **THEN** only `projects` SHALL appear in the entries (hidden dirs excluded)

#### Scenario: Entry limit applies after filtering
- **WHEN** a directory contains 300 subdirectories and `q=pi` is supplied
- **THEN** the server SHALL filter and rank first, then return at most 200 entries
- **AND** a directory named `pi-dashboard` SHALL appear in the results even if alphabetically past position 200

#### Scenario: Substring filter returns non-prefix matches
- **WHEN** a GET request is made with `q=dash` against a directory containing `pi-dashboard`, `my-dashboard-old`, and `readme`
- **THEN** `pi-dashboard` and `my-dashboard-old` SHALL appear in the results
- **AND** `readme` SHALL NOT appear

#### Scenario: Ranking by tier
- **WHEN** a GET request is made with `q=pi` against a directory containing `pi` (tier 0), `pi-core` (tier 1), `my-pi-tools` (tier 2), and `epiphany` (tier 3)
- **THEN** the entries SHALL be returned in the order `pi`, `pi-core`, `my-pi-tools`, `epiphany`

#### Scenario: Alphabetical order within tier
- **WHEN** two entries are in the same rank tier (e.g. both match `pi` as prefix)
- **THEN** they SHALL appear in case-insensitive alphabetical order

#### Scenario: Empty query treated as no filter
- **WHEN** `q` is an empty string or only whitespace
- **THEN** the server SHALL behave as if `q` were omitted (alphabetical, unfiltered)

## ADDED Requirements

### Requirement: Directory flag classification API
The server SHALL expose `GET /api/browse/flags?paths=<json-array>` (localhost-only) that classifies a batch of absolute paths as git repositories and/or pi projects. The `paths` query value SHALL be a URL-encoded JSON array of absolute path strings.

The response on success SHALL be:

```
{
  success: true,
  data: {
    flags: { [absolutePath: string]: { isGit: boolean; isPi: boolean } }
  }
}
```

The response key set SHALL equal the input `paths` set (one classification per input path, no extras, no omissions). For every input path the server SHALL probe `<path>/.git` and `<path>/.pi` using `fs.access`-style detection: any error (ENOENT, EACCES, ELOOP, race-on-deletion, target is not a directory, anything else) SHALL map the corresponding flag to `false`. The endpoint SHALL never throw out of a single bad path — only out-of-protocol failures (malformed `paths` JSON, over-cap input) SHALL produce a top-level error.

The endpoint SHALL cap input length at 100 paths per request. Internal probe concurrency SHALL be bounded (initial value 32 in-flight `fs.access` calls).

#### Scenario: Bulk classification of mixed paths
- **WHEN** a GET request is made with `paths=["/a/git-repo","/a/pi-project","/a/plain"]` where `/a/git-repo/.git` exists, `/a/pi-project/.pi` exists, and `/a/plain` is a plain directory
- **THEN** the response `data.flags` SHALL contain `"/a/git-repo": { isGit: true, isPi: false }`, `"/a/pi-project": { isGit: false, isPi: true }`, and `"/a/plain": { isGit: false, isPi: false }`

#### Scenario: Bulk classification of a non-existent path
- **WHEN** the request includes a path that does not exist on disk
- **THEN** the response SHALL include that path with `{ isGit: false, isPi: false }`
- **AND** the request SHALL still return `success: true`

#### Scenario: Path-count cap exceeded
- **WHEN** a GET request is made with more than 100 paths in the `paths` array
- **THEN** the server SHALL return `{ success: false, error: "too many paths" }` with HTTP 400
- **AND** no filesystem probe SHALL be performed

#### Scenario: Malformed paths parameter
- **WHEN** the `paths` query value is missing, empty, not valid JSON, or not an array of strings
- **THEN** the server SHALL return `{ success: false, error: "invalid paths" }` with HTTP 400

#### Scenario: Remote access blocked
- **WHEN** a GET request originates from a non-loopback address
- **THEN** the server SHALL return `{ success: false, error: "localhost only" }`

#### Scenario: Empty paths array
- **WHEN** a GET request is made with `paths=[]`
- **THEN** the server SHALL return `{ success: true, data: { flags: {} } }`
- **AND** no filesystem probe SHALL be performed
