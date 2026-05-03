## Context

`<ImageLightbox>` already exists, mounted via `<DialogPortal>`, with full zoom/pan via `useZoomPan`, Escape-to-close, and backdrop-click-to-close. It's currently consumed by exactly two call sites:

```
ImageAttachments (ChatView.tsx:37-60)
  - per-instance useState<{src,alt} | null>
  - <img onClick={() => setLightboxSrc({src, alt})}>
  - <ImageLightbox src alt onClose={...}> sibling

ReadToolRenderer.ReadToolImages (ReadToolRenderer.tsx:64-86)
  - same pattern, identical structure
```

`MarkdownContent.PiAssetImg` (the `img` component override added by `chat-markdown-local-images-and-math`) emits a bare `<img>` for both `pi-asset:` (resolved) and non-`pi-asset:` srcs. The placeholder branch returns a `<span>` for unresolved hashes and is intentionally not interactive.

## Goals / Non-Goals

**Goals**
- Click any rendered markdown `<img>` → opens the same `<ImageLightbox>` modal that pasted attachments use, with zoom/pan/escape behavior.
- Affordance is discoverable (cursor change on hover).
- Unresolved-asset placeholders stay non-interactive — there's no image to view yet.

**Non-Goals**
- Refactoring `ImageAttachments` or `ReadToolRenderer` (they already work).
- Lifting lightbox state to a shared `LightboxContext` (foundational work for arrow-key navigation, image carousel, etc. — deferred until there's a real feature pulling on it).
- Click handlers on plain `<a href="#anchor">` or non-image markdown elements — out of scope.
- Custom UX for SVGs (treated like any other image; the existing `<ImageLightbox>` `<img>` handles SVG just fine).
- Closing the lightbox on second-click of the same image (modal closes via Escape / backdrop / explicit close — same as the existing two paths).

## Decisions

### D1. Per-component state, mirroring the existing two paths

`PiAssetImg` keeps a local `useState<{src, alt} | null>(null)` and renders a sibling `<ImageLightbox>` conditionally. Pattern is byte-identical to `ImageAttachments` and `ReadToolRenderer.ReadToolImages`.

**Why not a `LightboxContext` at App level?** The existing two paths don't use one. Adding context now means refactoring three components when the user-facing payoff is just "click works on markdown images". A context becomes worth it when a future feature (arrow-key carousel, "Save image as", image gallery view) needs to coordinate across instances. Today's ask is a one-line behavior gap.

**Trade-off**: each `PiAssetImg` instance gets its own `useState`. With many images in a chat that's many tiny states. React handles this fine; the cost is negligible.

### D2. Lightbox state and modal live INSIDE `PiAssetImg`

Each `<img>` sits next to its own `<ImageLightbox>` sibling in the DOM. Clicking opens that instance's modal; closing clears that instance's state. If the user clicks two different markdown images in sequence, only one modal is ever visible (closing the first is a precondition to opening the second under normal user behavior — the modal covers the page, so a second click can't happen until the first closes).

**Edge case**: if multiple markdown images are clicked programmatically without intervening close events, multiple `<DialogPortal>` modals would mount. Practically impossible since the modal is full-screen. Accepted.

### D3. Lightbox src is the SAME string we pass to the underlying `<img>`

For the resolved `pi-asset:` case, that's `data:${asset.mimeType};base64,${asset.data}`. For non-`pi-asset:` cases (https, http, data, blob), it's the original `src` verbatim. The `<ImageLightbox>` is dumb — it just renders `<img src>`. Whatever the parent `<img>` would render, the lightbox renders.

**Note on `pi-asset:` raw token**: we never pass `pi-asset:<hash>` to the lightbox; we always pass the resolved `data:` URL. The lightbox doesn't know about our scheme.

### D4. `cursor-pointer` on resolved `<img>`, not on the placeholder span

Hover affordance is a one-class addition. The unresolved-placeholder `<span>` keeps its existing styling (dashed border, `(loading…)` text) — it's not clickable; there's nothing to view.

**Alternative considered**: `cursor-zoom-in` (more semantically precise). Existing two paths use `cursor-pointer`. Picking `cursor-pointer` keeps the three sites visually identical. Switching all three to `cursor-zoom-in` is a separate, bikeshed-prone tweak; not blocking this change.

### D5. `event.stopPropagation()` on the click

Markdown images can be nested inside a clickable region (e.g. `<a>` linkifying the image). Defensive `e.stopPropagation()` prevents the click from bubbling to a containing link, which would navigate away. The two existing paths don't do this because they're never inside a clickable parent. `MarkdownContent` images can be (e.g. `[![alt](src)](href)` is valid markdown).

**Trade-off**: an explicit click on a wrapping link no longer fires when the user clicks the image. To navigate, click outside the image. Acceptable — the user-facing intent of clicking an image is to enlarge, not navigate.

## Risks / Trade-offs

- **R1. External-URL images in lightbox** → the browser fetches the URL inside the modal-mounted `<img>`. Same network behavior as the markdown-page `<img>`. CORS is not a concern (we only read pixels, not canvas). Acceptable.
- **R2. Per-component state count** → a chat with 50 markdown images has 50 `useState`s. React handles this fine; verified pattern from `ImageAttachments`. Acceptable.
- **R3. Inside-link images stop navigating on click** → covered by D5. Acceptable per ux intent.
- **R4. Lightbox stacks if multiple PiAssetImgs are clicked** → physically impossible in normal user behavior (modal is full-screen). Defensive only.
- **R5. SVG security** → SVGs ride the same `<img>` element, browser image sandbox forbids inline scripts. Same property as today's bridge inliner SVG handling. Accepted.

## Migration Plan

No data migration. The change is additive. Old chats render new images with the click affordance immediately on next visit.

Rollback = revert the change set. Old `<img>` tags become bare `<img>` again, no click handler. No state corruption, no orphan lightbox.

## Open Questions

- Should `cursor-zoom-in` replace `cursor-pointer` across all three render sites for visual consistency? Out of scope for this change; could be a one-line follow-up.
- Should arrow-key navigation between sibling images in the same chat scroll be added? Out of scope; needs `LightboxContext` first.
