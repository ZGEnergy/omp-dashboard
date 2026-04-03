## 1. SyntaxHighlighter background override

- [x] 1.1 Add `customStyle={{ background: 'var(--bg-code)' }}` to `SyntaxHighlighter` in `MarkdownContent.tsx`
- [x] 1.2 Add `customStyle` background override to `SyntaxHighlighter` in `ReadToolRenderer.tsx`
- [x] 1.3 Add `customStyle` background override to `SyntaxHighlighter` in `WriteToolRenderer.tsx`

## 2. Pass themeName to getSyntaxTheme

- [x] 2.1 Update `ReadToolRenderer.tsx` to destructure `themeName` from `useThemeContext()` and pass it to `getSyntaxTheme(theme, themeName)`
- [x] 2.2 Update `WriteToolRenderer.tsx` to destructure `themeName` from `useThemeContext()` and pass it to `getSyntaxTheme(theme, themeName)`

## 3. Diff view theme colors

- [x] 3.1 Update `DiffView.tsx` to use `var(--accent-green)`, `var(--accent-red)`, `var(--accent-blue)` for text colors and `color-mix()` for transparent backgrounds
- [x] 3.2 Update `EditToolRenderer.tsx` inline DiffView to use the same theme-aware diff colors

## 4. Bash prompt and misc

- [x] 4.1 Update `BashToolRenderer.tsx` `$` prompt from `text-green-400` to `text-[var(--accent-green)]`
- [x] 4.2 Add `bg-[var(--bg-surface)]` to bare `<code>` elements in `ZrokInstallGuide.tsx`

## 5. Tests

- [x] 5.1 Update or add tests verifying tool renderers pass `themeName` to `getSyntaxTheme`
- [x] 5.2 Verify diff view components use CSS variable references instead of hardcoded Tailwind colors
