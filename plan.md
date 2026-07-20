# Issue #47 — Preserve currency text in MarkdownContent math rendering

## Goal

Keep `MarkdownContent`'s existing KaTeX support for genuine TeX while preventing prose currency markers such as `~$552k ... $552k` from opening one long single-dollar math span and swallowing later Markdown. The implementation must remain local to the client renderer and must not disable single-dollar math globally.

## Investigation findings

- Issue #47 reproduces with `~$552k of the window's money` followed later by `$552k`; `remark-math` consumes the intervening prose as one inline-math node, so Markdown `**...**` remains literal asterisks.
- `packages/client/src/components/MarkdownContent.tsx:383-421` currently assigns `processedContent = content`, passes `[remarkGfm, remarkMath, remarkFrontmatter]`, and passes `[rehypeRaw, [rehypeKatex, { throwOnError: false }], stripReactRefAttributes]`. No currency guard exists. Keep the rehype order and `throwOnError: false` unchanged.
- `packages/client/src/components/__tests__/MarkdownContent.test.tsx:449-478` currently covers single-dollar Pythagorean math, block `$$...$$`, `\\beta`, and half-formed math. It has no regression for one or multiple currency amounts.
- `packages/client/package.json:51-66` supplies the existing renderer dependencies: `remark-math@6.0.0`, `rehype-katex@7.0.1`, and `katex@0.16.45` (the lockfile resolves KaTeX to `0.16.47`). No dependency or package-script change is needed.
- `packages/client/vitest.config.ts:5-20` runs client component tests in jsdom and includes `src/**/__tests__/**/*.test.{ts,tsx}`. Root `npm test` supplies the isolated test `HOME` and `NODE_OPTIONS`.
- `packages/client/src/main.tsx:9-11` already imports the KaTeX stylesheet once; leave it unchanged.
- `openspec/specs/chat-math-rendering/spec.md:46-61` already documents the intended `$100`, two-amount, and escaped-dollar-plus-math behavior. The implementation and tests should bring runtime behavior back into line with this existing contract rather than change the spec.

## Files to modify

- `packages/client/src/components/MarkdownContent.tsx`
  - Add a small pure, markdown-aware currency guard before `ReactMarkdown` parses content.
  - Run it through the existing `processedContent` path (prefer the already-imported `useMemo`) so every streaming update is reprocessed once and the same guarded text is used by frontmatter extraction and render-time Mermaid completeness checks.
  - Preserve existing `remarkMath` defaults (`singleDollarTextMath: true`) and both single- and double-dollar math. Do not replace the plugin with `singleDollarTextMath: false`.
  - The guard should escape only an unescaped single dollar that begins a currency-looking numeric amount (`$` immediately followed by a digit), so Markdown sees `\\$552` as literal `$552`. It must not mutate `$$` delimiters, already escaped dollars, inline-code spans, or fenced code blocks; otherwise code blocks could visibly gain a backslash.
  - To preserve genuine numeric-leading TeX (for example `$2^n$`), classify a numeric-leading candidate with a matching delimiter and TeX markers such as `^`, `_`, braces, or control sequences as math and leave it intact. Plain numeric prose (`$100`, `$552k`, `$1,234.50`) remains escaped. Treat unmatched numeric currency starts as prose; escaping an unmatched delimiter is safe and prevents a later streamed dollar from joining it.
  - Keep the existing plugin arrays, URL handling, component overrides, and `rehypeRaw` → KaTeX → ref-strip ordering otherwise unchanged.

- `packages/client/src/components/__tests__/MarkdownContent.test.tsx`
  - Extend the existing `LaTeX math` describe block with behavior-focused regressions. Assert rendered DOM/text, not implementation details of the guard.

## Implementation steps

1. Add the pure source guard beside the existing MarkdownContent helpers. Implement a single pass that recognizes fenced code and inline backtick spans, skips escaped/double dollars, identifies numeric-leading dollar candidates, and escapes only prose currency candidates. Keep the helper allocation-linear and deterministic for streaming content.
2. Replace `const processedContent = content` with memoized guarded content. Do not alter the remark/rehype plugin configuration: preserving `remarkMath` single-dollar support is part of the contract.
3. Add the regression tests below. Retain all current math tests, image tests, and renderer tests unchanged.
4. Run the focused client test command and a focused TypeScript check for the changed package/source if the repository's installed toolchain supports it. Do not run the full project suite or formatter for this issue-only plan/implementation.

## Exact test cases

Add these cases to `MarkdownContent.test.tsx` (using the existing `renderMd` helper):

1. **Standalone currency remains text**
   - Input: `It costs $100 today.`
   - Expect: `container.querySelector(".katex")` is `null`; `container.textContent` contains the literal `$100`.

2. **Multiple currency amounts do not create math**
   - Input: `It cost $100 yesterday and $200 today.`
   - Expect: no `.katex`; text contains both literal `$100` and `$200`.

3. **Issue reproduction preserves later Markdown**
   - Input: `Consequence: ~$552k of the window's money; the whole $552k constraint moved into the **matches ERCOT** band.`
   - Expect: no `.katex`; text contains both `$552k` values; `container.querySelector("strong")?.textContent` is `matches ERCOT` (proves `**` was not swallowed as math).

4. **Existing genuine inline TeX remains KaTeX**
   - Input: `Pythagoras: $a^2 + b^2 = c^2$.`
   - Expect: `.katex` exists and surrounding paragraph text still contains `Pythagoras:`.

5. **Numeric-leading genuine TeX is not mistaken for currency**
   - Input: `The growth term is $2^n$.`
   - Expect: `.katex` exists and the paragraph does not render the source as literal `$2^n$` text. This locks the guard's TeX-looking exception rather than allowing a blanket `/$\\d/` replacement.

6. **Escaped currency can coexist with math**
   - Input: `Total \\$100, where $x > 0$.`
   - Expect: text contains `$100`; `.katex` exists for `x > 0`.

7. **Code content is not rewritten**
   - Inline input: ``Use `$100` literally.``; fenced input: ```` ```text\n$100 and $200\n``` ````.
   - Expect: no `.katex`; code text contains `$100`/`$200` and does not contain `\\$100` or `\\$200`.

Keep the existing display `$$...$$`, `\\beta`, and half-formed `$x = 10 +` tests as guards against regressions in double-dollar rendering, KaTeX parsing, and streaming fallback behavior.

## Focused verification commands

Run from `/home/joe/code/zge-workspace/worktrees/omp-dashboard/agent-rich-text-not-reliably-rendered` after implementation:

```bash
npm test -- packages/client/src/components/__tests__/MarkdownContent.test.tsx
npm exec tsc --noEmit --pretty false
```

The first command is the required behavioral proof. The second catches TypeScript errors in the changed component/test and existing workspace imports without invoking the full Vitest suite. Do not run `npm run quality:changed`, `npm test` without the focused path, or a formatter as part of this issue-specific change.

## Scope guard

No changes to `packages/client/package.json`, lockfiles, `main.tsx`, OpenSpec requirements, server/replay code, or issue #48. No new files are required.
