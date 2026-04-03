## Why

Code blocks and syntax-highlighted content don't respect the active dashboard theme. The SyntaxHighlighter component embeds its own background colors that clash with the theme's `--bg-code` variable, tool renderers don't pass the `themeName` so non-base themes always get base syntax colors, and diff views use hardcoded Tailwind colors that ignore theme accent definitions. This makes non-base themes (Dracula, Nord, GitHub, Catppuccin) look inconsistent, especially in light mode.

## What Changes

- Override SyntaxHighlighter's embedded background with `var(--bg-code)` across all components that use it (MarkdownContent, ReadToolRenderer, WriteToolRenderer)
- Pass `themeName` to `getSyntaxTheme()` in ReadToolRenderer and WriteToolRenderer so token colors match the active theme
- Replace hardcoded Tailwind diff colors in EditToolRenderer's inline DiffView and the standalone DiffView component with theme accent CSS variables
- Replace hardcoded `text-green-400` bash prompt color in BashToolRenderer with `var(--accent-green)`
- Add missing background styling to bare `<code>` elements in ZrokInstallGuide

## Capabilities

### New Capabilities

_(none — this is a fix across existing capabilities)_

### Modified Capabilities

- `theme-system`: Code rendering components SHALL use the dashboard theme's `--bg-code` for backgrounds instead of syntax-theme-embedded backgrounds
- `tool-renderers`: All tool renderers SHALL use the active theme name when resolving syntax highlighting styles; diff views SHALL use theme accent CSS variables for addition/deletion/hunk colors
- `markdown-rendering`: Fenced code blocks SHALL use `var(--bg-code)` as their background color regardless of the selected syntax theme

## Impact

- **Components**: `MarkdownContent.tsx`, `ReadToolRenderer.tsx`, `WriteToolRenderer.tsx`, `EditToolRenderer.tsx`, `DiffView.tsx`, `BashToolRenderer.tsx`, `ZrokInstallGuide.tsx`
- **Shared lib**: `syntax-theme.ts` (no changes needed, already supports themeName param)
- **No new dependencies, no API changes, no breaking changes**
