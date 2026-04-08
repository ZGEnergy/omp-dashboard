## Context

Images appear in three places in the chat UI:
1. **`ImageAttachments`** in `ChatView.tsx` — user messages & pending prompts (max 300×300)
2. **`ReadToolRenderer.tsx`** — tool result images (max 512×512)
3. **`CommandInput.tsx`** — paste preview thumbnails (16×16)

None of these support click-to-expand. The codebase already has:
- `DialogPortal` — portal wrapper with scroll-lock (used by interactive renderers)
- `useZoomPan` — wheel zoom, drag pan, pinch-to-zoom, double-click reset, button controls

## Goals / Non-Goals

**Goals:**
- Click any chat image to open a full-size lightbox dialog
- Zoom/pan within the lightbox (wheel, drag, pinch)
- Close via Esc key or backdrop click
- Minimal code: reuse `DialogPortal` and `useZoomPan`

**Non-Goals:**
- Image gallery/carousel navigation between multiple images
- Download button or image metadata display
- Markdown-embedded image rendering

## Decisions

### 1. Single shared `ImageLightbox` component

A new `src/client/components/ImageLightbox.tsx` component receives `src`, `alt`, and `onClose` props. It renders a dark overlay with the image transformed via `useZoomPan`. This keeps lightbox logic in one place rather than duplicating across three call sites.

**Alternative**: Inline modal in each location — rejected because DRY.

### 2. State managed by each call site via `useState`

Each image location manages its own `lightboxSrc` state (`string | null`). When an `<img>` is clicked, it sets the src. `ImageLightbox` calls `onClose` to clear it. This avoids global state or context providers.

**Alternative**: Global context/provider — rejected as overkill for a simple open/close toggle.

### 3. Reuse `useZoomPan` hook directly inside `ImageLightbox`

The hook already provides all needed interactions (wheel, drag, pinch, double-click reset). The lightbox container div gets the hook's event handlers. The image gets `transform: translate(…) scale(…)` from hook state.

### 4. Close on backdrop click only (not image click)

Clicking the image initiates drag/pan. Clicking the dark area outside the image closes the lightbox. This is achieved by stopping propagation on the image's pointer events from reaching the backdrop's onClick.

### 5. Esc key closes via `useEffect` keydown listener

A `useEffect` inside `ImageLightbox` registers a `keydown` listener for Escape. Cleanup removes it.

## Risks / Trade-offs

- **Large base64 images may be slow to render at full size** → Acceptable since images are already loaded in the chat; the lightbox just removes the max-width constraint.
- **Drag conflicts with backdrop close** → Mitigated by only closing on backdrop click (not image), and using `onPointerDown` capture for drag.
