## MODIFIED Requirements

### Requirement: ReadToolRenderer
The Read renderer SHALL display the file path as a header with an "Open in editor" button. The tool result (file content) SHALL be displayed in a syntax-highlighted code block with language auto-detection based on file extension. The syntax highlighting style SHALL be resolved using the active theme name.

#### Scenario: Read file displayed
- **WHEN** a read tool call completes with file content
- **THEN** the renderer SHALL show the file path and syntax-highlighted content

#### Scenario: Read file respects named theme
- **WHEN** a read tool call renders under the Dracula theme
- **THEN** the syntax token colors SHALL use the Dracula syntax style, not the base default

### Requirement: WriteToolRenderer
The Write renderer SHALL display the file path as a header with an "Open in editor" button. The written content SHALL be displayed in a syntax-highlighted code block. The syntax highlighting style SHALL be resolved using the active theme name.

#### Scenario: Write file displayed
- **WHEN** a write tool call completes
- **THEN** the renderer SHALL show the file path and written content

#### Scenario: Write file respects named theme
- **WHEN** a write tool call renders under the Nord theme
- **THEN** the syntax token colors SHALL use the Nord syntax style, not the base default

### Requirement: BashToolRenderer
The Bash renderer SHALL display the command with a `$` prompt in the theme's accent green color. The tool result (stdout/stderr) SHALL be displayed below in a scrollable pre-formatted block.

#### Scenario: Bash command displayed
- **WHEN** a bash tool call completes
- **THEN** the renderer SHALL show the command and its output

#### Scenario: Bash prompt uses theme accent
- **WHEN** the bash renderer displays under any named theme
- **THEN** the `$` prompt color SHALL use `var(--accent-green)`

### Requirement: DiffView component
The `DiffView` component SHALL render unified diff content with colored lines using theme accent CSS variables: additions (`+` prefix) SHALL use `var(--accent-green)` text with a transparent green background, deletions (`-` prefix) SHALL use `var(--accent-red)` text with a transparent red background, and hunk headers (`@@` prefix) SHALL use `var(--accent-blue)` text.

#### Scenario: Diff with additions and deletions
- **WHEN** diff content contains `+` and `-` lines
- **THEN** additions SHALL use `var(--accent-green)` styling and deletions SHALL use `var(--accent-red)` styling

#### Scenario: Diff colors adapt to theme
- **WHEN** a diff view renders under the Nord theme
- **THEN** addition/deletion/hunk colors SHALL use Nord's accent values, not hardcoded Tailwind colors
