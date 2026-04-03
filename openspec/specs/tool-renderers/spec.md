## Purpose

Renders tool call results in the chat view with specialized per-tool visualizations. Each tool type has a dedicated renderer that understands its arguments and output format.

## ADDED Requirements

### Requirement: Tool renderer registry
The client SHALL maintain a registry mapping tool names to renderer components. A `getToolRenderer(toolName)` function SHALL return the specialized renderer for known tools or fall back to `GenericToolRenderer` for unrecognized tools.

Built-in renderers:
- `read` → `ReadToolRenderer`
- `edit` → `EditToolRenderer`
- `write` → `WriteToolRenderer`
- `bash` → `BashToolRenderer`
- All others → `GenericToolRenderer`

#### Scenario: Known tool renders with specialized view
- **WHEN** a tool call for "read" is displayed
- **THEN** the `ReadToolRenderer` SHALL be used

#### Scenario: Unknown tool uses generic renderer
- **WHEN** a tool call for "custom_tool" is displayed
- **THEN** the `GenericToolRenderer` SHALL be used

### Requirement: ReadToolRenderer
The Read renderer SHALL display the file path as a header with an "Open in editor" button. The tool result (file content) SHALL be displayed in a syntax-highlighted code block with language auto-detection based on file extension. The syntax highlighting style SHALL be resolved using the active theme name.

#### Scenario: Read file displayed
- **WHEN** a read tool call completes with file content
- **THEN** the renderer SHALL show the file path and syntax-highlighted content

#### Scenario: Read file respects named theme
- **WHEN** a read tool call renders under the Dracula theme
- **THEN** the syntax token colors SHALL use the Dracula syntax style, not the base default

### Requirement: EditToolRenderer
The Edit renderer SHALL display the file path as a header. When `oldText` and `newText` arguments are present, they SHALL be rendered as a unified diff view using the `DiffView` component. When an `edits` array argument is present, each entry's `oldText` and `newText` SHALL be rendered as a separate `DiffView`, stacked vertically with a thin border separator between them. When neither format is present, arguments SHALL be displayed as raw JSON.

#### Scenario: Single edit displayed as diff
- **WHEN** an edit tool call has `oldText` and `newText` arguments
- **THEN** the renderer SHALL show a single diff view of oldText → newText

#### Scenario: Multi-edit displayed as stacked diffs
- **WHEN** an edit tool call has an `edits` array with multiple entries
- **THEN** the renderer SHALL show one diff view per entry, separated by thin borders

#### Scenario: Empty or missing edit data shows raw JSON
- **WHEN** an edit tool call has neither `oldText`/`newText` nor `edits` array
- **THEN** the renderer SHALL display the arguments as formatted JSON

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

### Requirement: GenericToolRenderer
The Generic renderer SHALL display the tool name as a header, arguments as a JSON code block, and the result as a pre-formatted text block.

#### Scenario: Unknown tool displayed
- **WHEN** a tool call for an unrecognized tool completes
- **THEN** the renderer SHALL show the tool name, arguments, and result

### Requirement: DiffView component
The `DiffView` component SHALL render unified diff content with colored lines using theme accent CSS variables: additions (`+` prefix) SHALL use `var(--accent-green)` text with a transparent green background, deletions (`-` prefix) SHALL use `var(--accent-red)` text with a transparent red background, and hunk headers (`@@` prefix) SHALL use `var(--accent-blue)` text.

#### Scenario: Diff with additions and deletions
- **WHEN** diff content contains `+` and `-` lines
- **THEN** additions SHALL use `var(--accent-green)` styling and deletions SHALL use `var(--accent-red)` styling

#### Scenario: Diff colors adapt to theme
- **WHEN** a diff view renders under the Nord theme
- **THEN** addition/deletion/hunk colors SHALL use Nord's accent values, not hardcoded Tailwind colors

### Requirement: Open file button
Tool renderers for file-based tools (Read, Write) SHALL include an "Open in editor" button that calls `POST /api/open-editor` with the file path and optionally the line number. The button SHALL only appear when the dashboard is accessed from localhost.

#### Scenario: Open file in editor
- **WHEN** user clicks the open button on a ReadToolRenderer
- **THEN** the client SHALL call `/api/open-editor` with the file path

#### Scenario: Button hidden on remote access
- **WHEN** the dashboard is accessed via a tunnel or non-localhost URL
- **THEN** the open file button SHALL NOT be displayed

### Requirement: Language auto-detection
Tool renderers SHALL auto-detect the programming language for syntax highlighting based on the file extension. Common mappings SHALL include `.ts`→typescript, `.tsx`→tsx, `.js`→javascript, `.py`→python, `.rs`→rust, `.go`→go, `.md`→markdown, etc.

#### Scenario: TypeScript file highlighted
- **WHEN** a read tool call shows a `.ts` file
- **THEN** the content SHALL be highlighted as TypeScript
