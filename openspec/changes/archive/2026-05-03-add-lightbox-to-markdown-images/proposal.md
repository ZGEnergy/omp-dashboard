## Why

`MarkdownContent` renders three categories of images today: `pi-asset:<hash>` (rewritten by the bridge from local-path references), external URLs (`https://github…/logo.png`), and inline `data:` URLs. None of them are clickable to open a full-screen viewer with zoom/pan. Pasted user attachments (`ImageAttachments`) and Read-tool image results (`ReadToolRenderer.ReadToolImages`) **already** have the click-to-open `<ImageLightbox>` affordance — they wrap each `<img>` with an `onClick` that sets a local `lightboxSrc` state and render a sibling `<ImageLightbox>` when set. The new `pi-asset:` rendering pathway exposed this gap because users now have a real reason to inline images they want to inspect at full size.

## What Changes

- `MarkdownContent.PiAssetImg` (the `img` component override) gains an `onClick` handler that sets a local `lightboxSrc` state and renders an `<ImageLightbox>` sibling, mirroring exactly the pattern in `ImageAttachments` and `ReadToolRenderer.ReadToolImages`. The handler fires for every renderable `<img>` produced by markdown:
  - `pi-asset:<hash>` srcs (resolved to a `data:` URL via `useSessionAssets()`) — opens the lightbox with the resolved URL.
  - External `https://…` and `http://…` srcs — opens the lightbox with the URL as-is. The browser fetches normally; works for any image the surrounding `<img>` already loads.
  - `data:image/…` srcs (pasted directly into the markdown source) — opens the lightbox with the URL as-is.
  - Unresolved `pi-asset:<hash>` placeholder spans stay non-clickable; there's no image to view yet.
- The `<img>` gets `cursor-pointer` styling so the affordance is discoverable.
- State is local to `PiAssetImg` — same pattern as the existing two paths, no LightboxContext refactor.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `markdown-rendering`: the existing "Markdown text rendering" requirement adds a new scenario describing click-to-open lightbox behavior. The img-rendering rule itself is widened from "render via `PiAssetImg` / default `<img>`" to "render via `PiAssetImg` whose `<img>` is clickable and opens an `<ImageLightbox>` for any non-placeholder src". Existing scenarios (math, ASCII tables, GFM, code blocks, mermaid, external links) untouched.

## Impact

- **Affected files**: `packages/client/src/components/MarkdownContent.tsx` (extend `PiAssetImg`, ~15 lines), `packages/client/src/components/__tests__/MarkdownContent.test.tsx` (add 2-3 click-behavior tests). No other files touched.
- **No new npm dependencies**: `<ImageLightbox>`, `useState`, and `useSessionAssets` already in the bundle.
- **No bridge / server / electron changes**: this is purely a client-side render-tree change.
- **Bundle delta**: trivially small — the lightbox component and `useZoomPan` hook are already shipped because `ImageAttachments` uses them.
- **Backward compatibility**: external-URL and inline-`data:` images that previously rendered as bare `<img>` now render as bare `<img>` plus a click handler that opens the existing lightbox. No behavior is removed.
