# Tasks

## 1. Inliner — HTML `<img>` tag detection

- [ ] 1.1 Add `HTML_IMG_TAG_RE` regex constant alongside `IMAGE_TOKEN_RE` in `packages/extension/src/markdown-image-inliner.ts`. Shape per design Decision 2.
- [ ] 1.2 Export new pure helper `parseHtmlImageTags(text: string): ParsedHtmlImageTag[]` returning `{ tag, src, srcStart, srcEnd, srcQuote, index, length }` per match. Mirror the shape of `parseImageTokens`. TDD: write tests first in `__tests__/markdown-image-inliner.test.ts` under a new `describe("parseHtmlImageTags")` block.
- [ ] 1.3 Cases to cover in unit tests for `parseHtmlImageTags`:
  - Double-quoted src.
  - Single-quoted src.
  - Self-closing `<img ... />`.
  - Mixed attribute order (`<img alt="x" src="y">`, `<img src="y" alt="x">`).
  - Multiple tags in one text — all matched.
  - Tag spanning attributes with extra whitespace.
  - Case-insensitive tag name (`<IMG>`, `<Img>`, `<img>`).
  - Partial tag (no closing `>`) — NOT matched.
  - Multi-line src — NOT matched.
  - Unquoted src — NOT matched (out of scope per Decision 7).
  - Already-rewritten `<img src="pi-asset:abc">` — matched, then handled by pass-through in `inlineMessageText`.

## 2. Inliner — rewrite-in-place stitching

- [ ] 2.1 Add `rewriteHtmlImageSrc(tag: ParsedHtmlImageTag, newSrcValue: string): string` helper that returns the tag with only the `src` attribute value replaced, preserving quote style and all other attributes. TDD: tests first.
- [ ] 2.2 Tests for `rewriteHtmlImageSrc`:
  - Other attributes preserved verbatim (including order, whitespace, quoting).
  - Double-quoted src remains double-quoted on rewrite.
  - Single-quoted src remains single-quoted on rewrite.
  - Boolean attributes (e.g. `<img src="..." hidden>`) preserved.

## 3. Inliner — orchestration

- [ ] 3.1 Extend `inlineMessageText` to run a second pass over HTML `<img>` tags after the existing markdown-token pass. Both passes share the same `alreadyEmitted` set and accumulate into the same `assetsToEmit` array.
- [ ] 3.2 Pass-through cases (no rewrite, no asset_register emitted): src is `data:`, `blob:`, `http:`, `https:`, `pi-asset:`, or `#`. Reuse `isLocalSrc`.
- [ ] 3.3 Failure cases — replace the **entire `<img>` tag** with the same placeholder text format used for markdown tokens: `[image not found: src]`, `[image read failed: src]`, `[unsupported image type: src]`, `[image too large: src (N.N MB)]`, `[message asset budget exhausted: src]`.
- [ ] 3.4 Per-image cap (5 MB) and per-message cumulative cap (20 MB) apply identically to bytes contributed by HTML tags. The cumulative counter is shared with the markdown-token pass within the same call.

## 4. Inliner — integration tests

- [ ] 4.1 New describe block `inlineMessageText — HTML <img> tag cases` in `markdown-image-inliner.test.ts`:
  - Local-path HTML img → rewritten to `pi-asset:<hash>` in place, `asset_register` emitted.
  - External URL HTML img → unchanged.
  - `pi-asset:` HTML img → unchanged (idempotency).
  - Same file referenced first by markdown token, then by HTML img → exactly one asset emitted.
  - Same file referenced first by HTML img, then by markdown token → exactly one asset emitted.
  - Read failure → entire tag replaced with `[image not found: src]`.
  - Oversized file → entire tag replaced with `[image too large: src (N.N MB)]`.
  - Per-message budget exhausted → entire tag replaced with `[message asset budget exhausted: src]`.
  - Mixed: markdown token + HTML tag in same text both inlined, both bytes counted in per-message budget.

- [ ] 4.2 Idempotency over the combined pipeline:
  - Running `inlineMessageText` on the output of a prior `inlineMessageText` call yields byte-identical text and zero new `assetsToEmit` entries (the per-session `alreadyEmitted` set is reset between runs to simulate fresh-state idempotency; same-session re-runs are tested separately).

## 5. Spec update

- [ ] 5.1 Add the new requirement and scenarios to `openspec/changes/inline-raw-html-image-tags/specs/bridge-asset-inlining/spec.md` (delta — additive only). Done as part of this change drafting.

## 6. Validate

- [ ] 6.1 `openspec validate inline-raw-html-image-tags --strict` passes.
- [ ] 6.2 `npm test -- markdown-image-inliner` passes locally.
- [ ] 6.3 Manual smoke: with `npm run reload`, ask an active session to reply with both `![alt](/abs/path.png)` and `<img src="/abs/path.png">` referencing a real local image; both should render as resolved images in the chat (no broken icon).
