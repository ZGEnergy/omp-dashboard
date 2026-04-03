## Context

ChatView re-renders on every WebSocket event (new messages, tool status updates, streaming text). Neither `MarkdownContent` nor `MermaidBlock` are memoized, so every re-render cascades through ReactMarkdown which recreates its component tree — unmounting and remounting `MermaidBlock` instances. Each remount loses SVG state, flashes "Loading diagram…", and re-runs the async mermaid.render() call.

## Goals / Non-Goals

**Goals:**
- Eliminate visible mermaid diagram blinking during active sessions
- Minimize unnecessary re-renders of completed message content
- Zero impact on rendering correctness or diagram interactivity

**Non-Goals:**
- Optimizing ReactMarkdown itself or replacing it
- Caching across page reloads (session-scoped cache is sufficient)
- Memoizing other heavy components (ToolCallStep, SyntaxHighlighter, etc.)

## Decisions

### 1. `React.memo` on `MarkdownContent`

Wrap the exported component in `React.memo`. Since the only prop is `content: string`, shallow comparison is sufficient — no custom comparator needed.

**Why not memo on MessageBubble?** MessageBubble takes `content`, `className`, and `timestamp` — all stable for completed messages. Could be done later but `MarkdownContent` is the higher-leverage target since it prevents ReactMarkdown from re-parsing.

### 2. Module-level SVG cache in `MermaidBlock`

Add a `Map<string, string>` at module scope keyed by `${code}\0${theme}`. After `mermaid.render()` succeeds, store the SVG. On mount, check cache first and initialize `svg` state from it.

**Why module-level, not context/ref?** The cache needs to survive component unmount/remount — that's the whole point. A module-scope Map is the simplest approach. It lives for the page session and gets cleared on navigation/refresh.

**Why not a hash?** The code string itself is a perfect key (concatenated with theme). Hashing adds complexity for no benefit — Map handles arbitrary string keys efficiently.

### 3. `React.memo` on `MermaidBlock`

Defense-in-depth. When MarkdownContent does re-render (e.g. streaming), React.memo on MermaidBlock prevents re-render if `code` prop is unchanged.

## Risks / Trade-offs

- **[Memory]** SVG cache grows unbounded per page load → Negligible in practice; typical sessions have <10 unique diagrams. Could add LRU eviction later if needed.
- **[Stale cache]** Theme change with same code needs fresh render → Handled by including theme in cache key.
- **[React.memo overhead]** Shallow comparison on every render → Trivial cost for string props; net positive.
