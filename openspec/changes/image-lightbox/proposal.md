# Image Lightbox with Zoom/Pan

## Problem

Images in the chat window (user messages, tool results, paste previews) render as inline thumbnails at fixed max sizes (300px, 512px, 16px). There is no way to view images at full size — clicking does nothing. For screenshots and detailed images this makes them hard to inspect.

## Solution

Add a click-to-open **image lightbox dialog** across all image locations in the chat UI:

```
  Chat message with thumbnail
  ┌──────┐
  │ img  │ ← click (cursor-pointer)
  └──────┘
       │
       ▼
  ┌────────────────────────────────┐
  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░  │
  │  ░░                        ░░  │
  │  ░░   Full-size image      ░░  │  Dark overlay
  │  ░░   with zoom/pan        ░░  │  Esc or click outside → close
  │  ░░                        ░░  │
  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░  │
  └────────────────────────────────┘
```

- **Esc** or **backdrop click** closes the dialog
- **Zoom/pan** via the existing `useZoomPan` hook (wheel zoom, drag pan, pinch)
- Rendered via `DialogPortal` for proper layering and scroll-lock

## Scope

- New `ImageLightbox` component (dialog overlay with zoom/pan)
- Add click-to-open to all 3 image locations:
  1. `ImageAttachments` in `ChatView.tsx` (user messages & pending prompts)
  2. `ReadToolRenderer.tsx` (tool result images)
  3. `CommandInput.tsx` (paste preview thumbnails)

## Out of Scope

- Image gallery / carousel for navigating between multiple images
- Download button or metadata display
- Rendering images embedded in markdown content
