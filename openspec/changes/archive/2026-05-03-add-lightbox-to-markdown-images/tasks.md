## 1. Implementation

- [x] 1.1 In `packages/client/src/components/MarkdownContent.tsx` extended `PiAssetImg`:
  - Added `useState<{src,alt} | null>(null)` for the lightbox
  - Wired `onClick` with `e.stopPropagation()` + `e.preventDefault()` on both resolved-image and fall-through branches; `cursor-pointer` added to className
  - Renders `<ImageLightbox>` as a sibling when `lightboxSrc` is set
  - Unresolved-placeholder `<span>` left non-interactive
- [x] 1.2 Imported `ImageLightbox` into MarkdownContent.tsx

## 2. Tests

- [x] 2.1 Added 5 new tests in `MarkdownContent.test.tsx` under a new `describe("click-to-open lightbox on markdown images", ...)` block:
  - Clicking a resolved `pi-asset:` image mounts a lightbox via `DialogPortal` with the resolved data URL + alt
  - Clicking an external `https://` image opens the lightbox with the URL verbatim
  - Clicking an inline `data:` image opens the lightbox with the data URL verbatim
  - Unresolved `pi-asset:` placeholder is a `<span>`, has no `<img>`, click is a no-op
  - Click stops propagation: image-inside-link does not invoke parent click handler
  - Added top-level `afterEach(cleanup)` so portal-mounted modals don't leak between tests

## 3. Acceptance gates

- [x] 3.1 `npm test` — 4212 passed / 9 skipped (was 4207 — +5 new tests in `MarkdownContent.test.tsx`); no regressions
- [x] 3.2 `npm run build` — client built cleanly; bundle size unchanged (2.55 MB gzipped — `ImageLightbox` was already in the bundle)
- [x] 3.3 Manual: user verified clicking pi-asset, external URL, and inline data: images opens the shared `<ImageLightbox>` with zoom / pan / Escape / backdrop-click intact
