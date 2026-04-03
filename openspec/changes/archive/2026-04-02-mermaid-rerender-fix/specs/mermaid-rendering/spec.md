## ADDED Requirements

### Requirement: Mermaid SVG cache prevents re-render blink
MermaidBlock SHALL cache rendered SVG strings at module scope keyed by diagram code and theme. On mount, if a cached SVG exists for the current code+theme, it SHALL initialize with the cached value instead of showing a loading state.

#### Scenario: Remount with cached SVG
- **WHEN** a MermaidBlock unmounts and remounts with the same code and theme
- **THEN** it SHALL display the cached SVG immediately without a loading flash

#### Scenario: Theme change invalidates cache entry
- **WHEN** the theme changes from dark to light (or vice versa)
- **THEN** MermaidBlock SHALL re-render the diagram with the new theme and cache the result separately

### Requirement: MarkdownContent skips re-render on unchanged content
MarkdownContent SHALL be wrapped in React.memo so that it skips re-rendering when its `content` prop has not changed.

#### Scenario: Parent re-renders with same content
- **WHEN** ChatView re-renders due to a new WebSocket event but a completed message's content is unchanged
- **THEN** MarkdownContent for that message SHALL NOT re-render

### Requirement: MermaidBlock skips re-render on unchanged code
MermaidBlock SHALL be wrapped in React.memo so that it skips re-rendering when its `code` prop has not changed.

#### Scenario: MarkdownContent re-renders with same mermaid code
- **WHEN** MarkdownContent re-renders (e.g. during streaming) but the mermaid code block is unchanged
- **THEN** MermaidBlock SHALL NOT re-render
