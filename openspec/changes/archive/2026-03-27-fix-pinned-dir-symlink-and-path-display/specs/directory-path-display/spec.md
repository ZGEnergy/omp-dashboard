## ADDED Requirements

### Requirement: Full path display in group headers
Directory group headers SHALL display the full absolute path instead of only the basename.

#### Scenario: Short path fits available space
- **WHEN** the full path is `/Users/robson/judo-ng`
- **THEN** the group header SHALL display `/Users/robson/judo-ng`

#### Scenario: Long path exceeds available space
- **WHEN** the full path is longer than the display threshold
- **THEN** the group header SHALL display the path with the middle replaced by `…`, preserving the leading prefix and the final directory name (e.g., `/Users/robson/Project…/judo-meta-esm`)

### Requirement: Middle truncation preserves boundaries
The middle-truncation function SHALL always preserve the last path segment (directory name) and as many leading segments as fit within the maximum length.

#### Scenario: Path within limit
- **WHEN** `truncatePathMiddle("/a/b/c", 20)` is called
- **THEN** it SHALL return `/a/b/c` unchanged

#### Scenario: Path exceeds limit
- **WHEN** `truncatePathMiddle("/Users/robson/Project/some/deep/judo-meta-esm", 35)` is called
- **THEN** it SHALL return a string no longer than 35 characters, ending with `/judo-meta-esm`, with `…` replacing omitted middle segments

#### Scenario: Path with only root and name
- **WHEN** the path has only two segments (e.g., `/judo-ng`)
- **THEN** it SHALL return the path unchanged regardless of max length

### Requirement: Symlink resolution on pin
The server SHALL resolve symlinks when storing pinned directory paths, using `fs.realpathSync()`.

#### Scenario: Pinning a symlink path
- **WHEN** a user pins `/Project/judo-ng` and `/Project` is a symlink to `/Users/robson/Project`
- **THEN** the server SHALL store `/Users/robson/Project/judo-ng` as the pinned path

#### Scenario: Reordering with symlink paths
- **WHEN** a `reorder_pinned_dirs` message contains symlink paths
- **THEN** the server SHALL resolve each path before storing

#### Scenario: Path does not exist on disk
- **WHEN** `realpathSync` fails because the path does not exist
- **THEN** the server SHALL fall back to storing the original unresolved path
