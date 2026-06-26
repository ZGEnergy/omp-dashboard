# Tasks — Improve frontmatter rendering

## 1. Dependencies
- [ ] 1.1 Add `remark-frontmatter` and `yaml` to `packages/client/package.json` → verify: `npm install` succeeds, lockfile updated
- [ ] 1.2 Confirm `@mdi/js` already provides the needed type icons → verify: import resolves in a scratch file

## 2. FrontmatterProperties component
- [ ] 2.1 Add `extractFrontmatter(content)` helper: match a single leading `---\n…\n---` block, return `{ raw, body }` or null → verify: unit test for present / absent / mid-document `---`
- [ ] 2.2 Create `packages/client/src/components/FrontmatterProperties.tsx`: parse raw with `yaml.parse` in try/catch; render collapsed panel (`▸ Properties · N fields`), expand on click → verify: renders rows for a sample skill frontmatter
- [ ] 2.3 Implement value typing (text/para/number/date/list/bool/link/object/empty) + `status` known-key badge + relative-date formatting → verify: unit tests per type
- [ ] 2.4 Malformed-YAML path: warn banner + raw lines; wrap render so a throw degrades to nothing → verify: malformed input test renders banner, body unaffected

## 3. Wire into MarkdownContent
- [ ] 3.1 Add `frontmatter?: "hide" | "properties"` prop (default `"hide"`) to `MarkdownContent` → verify: type-checks
- [ ] 3.2 Add `remark-frontmatter` to the remark plugin chain; ensure body no longer mangles → verify: scenario "Leading frontmatter does not mangle the body"
- [ ] 3.3 When `"properties"` and a block is present, render `FrontmatterProperties` above the body → verify: scenario "Properties mode renders a collapsed panel"

## 4. Opt-in surfaces
- [ ] 4.1 `MarkdownPreviewView` passes `frontmatter="properties"` → verify: spec scenario "Frontmatter renders as Properties panel"
- [ ] 4.2 `FilePreviewOverlay` markdown branch passes `frontmatter="properties"` → verify: spec scenario "Markdown file with frontmatter opened in overlay"
- [ ] 4.3 Confirm `ChatView` and other non-opt-in callers keep the default (no panel) → verify: chat render test unchanged

## 5. Tests & verification
- [ ] 5.1 Add/extend `MarkdownContent.test.tsx` with the new spec scenarios (hide default, properties, typed values, status badge, nested object, malformed, no-frontmatter)
- [ ] 5.2 `npm test` green → verify: full vitest run passes
- [ ] 5.3 `npm run quality:changed` clean → verify: biome + tsc + tests single exit code
- [ ] 5.4 Visual check against `./mockups/` in a real browser (dark + light) → verify: dialog + preview surfaces match the mockup design
