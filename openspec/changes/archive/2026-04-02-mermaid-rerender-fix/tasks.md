## 1. MermaidBlock SVG cache

- [x] 1.1 Add module-level `Map<string, string>` SVG cache to `MermaidBlock.tsx`
- [x] 1.2 On successful `mermaid.render()`, store SVG in cache keyed by `${code}\0${theme}`
- [x] 1.3 Initialize `svg` state from cache on mount (lazy initializer in `useState`)
- [x] 1.4 Skip `renderMermaid` call in `useEffect` when cache hit (existing guard + cache lookup)

## 2. React.memo wrappers

- [x] 2.1 Wrap `MermaidBlock` export in `React.memo`
- [x] 2.2 Wrap `MarkdownContent` export in `React.memo`

## 3. Tests

- [x] 3.1 Add test: MermaidBlock initializes from cache on remount (no loading flash)
- [x] 3.2 Add test: MarkdownContent does not re-render when content prop is unchanged
- [x] 3.3 Verify existing MermaidBlock and MarkdownContent tests still pass
