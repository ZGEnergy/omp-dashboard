## Context

The dashboard has a theme system with 5 named themes (Base, Dracula, Nord, GitHub, Catppuccin), each defining CSS custom properties and a paired syntax highlighting style from react-syntax-highlighter. Code rendering happens in two layers: (1) `SyntaxHighlighter` for language-aware blocks, and (2) raw `<pre>`/`<code>` for plain text. The syntax highlighter embeds its own background color which overrides the theme's `--bg-code` variable, and two tool renderers don't pass the theme name when selecting syntax styles.

## Goals / Non-Goals

**Goals:**
- All code backgrounds use the dashboard theme's `--bg-code` CSS variable
- Syntax token colors match the active named theme in all components
- Diff views use theme accent CSS variables instead of hardcoded Tailwind colors

**Non-Goals:**
- Refactoring the theme system itself
- Adding new CSS variables (existing `--bg-code`, `--accent-green`, `--accent-red`, `--accent-blue` are sufficient)
- Changing the syntax highlighting library or available syntax themes
- Making all UI accent colors (status badges, links, etc.) theme-variable-based — only code rendering is in scope

## Decisions

### 1. Override SyntaxHighlighter background via `customStyle`

**Decision**: Pass `customStyle={{ background: 'var(--bg-code)' }}` to every `<SyntaxHighlighter>` instance.

**Why**: The syntax theme objects (oneDark, dracula, nord, etc.) each embed a `background` property on `pre[class*="language-"]`. SyntaxHighlighter applies this as an inline style, which takes precedence over CSS classes. The `customStyle` prop merges after the theme style, so it wins. This is a 1-line addition per call site.

**Alternative considered**: Mutating the imported style objects to remove their background property. Rejected because it modifies shared objects and is fragile across library updates.

### 2. Pass `themeName` through existing `getSyntaxTheme` API

**Decision**: Change `getSyntaxTheme(theme)` to `getSyntaxTheme(theme, themeName)` in ReadToolRenderer and WriteToolRenderer, reading `themeName` from `useThemeContext()`.

**Why**: The function already accepts `themeName` as a second parameter with a default of `"base"`. The tool renderers simply aren't passing it. This is a 1-line change per renderer.

### 3. Use CSS variable references for diff colors

**Decision**: Replace hardcoded Tailwind diff colors with `var(--accent-*)` references using Tailwind arbitrary values:
- `text-green-400` → `text-[var(--accent-green)]`
- `text-red-400` → `text-[var(--accent-red)]`  
- `text-blue-400` → `text-[var(--accent-blue)]`
- `bg-green-900/20` → `bg-[color-mix(in_srgb,var(--accent-green)_15%,transparent)]` (or inline style with opacity)

**Why**: Every theme already defines `--accent-green`, `--accent-red`, and `--accent-blue` with appropriate values for its palette. Diff backgrounds need transparency — use `color-mix()` or an inline style with opacity for simplicity.

**Alternative considered**: Adding dedicated `--diff-add`, `--diff-del`, `--diff-hunk` CSS variables. Rejected as over-engineering — the accent colors already serve this purpose.

### 4. Inline style for diff backgrounds (transparency)

**Decision**: Use inline `style={{ backgroundColor: 'color-mix(in srgb, var(--accent-green) 15%, transparent)' }}` for diff line backgrounds rather than Tailwind arbitrary values.

**Why**: `color-mix()` with CSS variables is cleaner than trying to encode it in Tailwind class syntax. Browser support is excellent (baseline 2023). Keeps the color fully theme-driven.

## Risks / Trade-offs

- **[Syntax token / background mismatch]** → The syntax theme's token colors were designed for its specific background. Forcing `--bg-code` might reduce contrast slightly for some theme combinations. Mitigation: each theme's `--bg-code` is already close to its syntax theme's native background (e.g., Dracula's `--bg-code: #1e1f29` vs. syntax bg `#282a36`). Visual difference is minimal.
- **[color-mix browser support]** → Requires Safari 16.4+, Chrome 111+, Firefox 113+. Mitigation: these are all 2023+ browsers; the dashboard already uses modern CSS features. Fallback would be barely visible background shading — acceptable degradation.
