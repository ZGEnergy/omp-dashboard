## Why

Mermaid diagrams in ChatView blink/flash on every WebSocket message. Each incoming event triggers a full re-render cascade: ChatView → MessageBubble → MarkdownContent → ReactMarkdown recreates component tree → MermaidBlock unmounts/remounts → SVG state resets to null → "Loading diagram…" flash → mermaid.render() runs again. This creates a poor visual experience during active sessions.

## What Changes

- Wrap `MarkdownContent` in `React.memo` so completed messages skip re-renders when `content` prop is unchanged
- Add a module-level SVG cache (`Map<string, string>`) to `MermaidBlock` keyed by code+theme, so remounted instances display cached SVG instantly without re-rendering
- Initialize `MermaidBlock` state from cache on mount, eliminating the "Loading diagram…" flash
- Wrap `MermaidBlock` in `React.memo` as defense-in-depth

## Capabilities

### New Capabilities

_(none — this is a performance fix to existing rendering)_

### Modified Capabilities

_(no spec-level behavior changes — diagrams render identically, just without unnecessary re-renders)_

## Impact

- **Files**: `src/client/components/MarkdownContent.tsx`, `src/client/components/MermaidBlock.tsx`
- **Risk**: Low — `React.memo` is a shallow-compare optimization; SVG cache is a simple module-scope Map that mirrors what mermaid already computed
- **Memory**: SVG cache grows with unique diagram+theme combinations per page load; negligible for typical sessions
