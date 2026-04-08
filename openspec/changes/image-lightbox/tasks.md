## 1. ImageLightbox Component

- [x] 1.1 Create `ImageLightbox.tsx` with dark overlay, full-size image, `useZoomPan` integration, Esc key listener, and backdrop-click close
- [x] 1.2 Write tests for ImageLightbox: renders image, Esc closes, backdrop click closes, image click does not close

## 2. Wire Up Chat Images

- [x] 2.1 Add lightbox state and click handler to `ImageAttachments` in `ChatView.tsx` (user messages & pending prompts)
- [x] 2.2 Add lightbox state and click handler to `ReadToolRenderer.tsx` (tool result images)
- [x] 2.3 Add lightbox state and click handler to `CommandInput.tsx` (paste preview thumbnails)
- [x] 2.4 Add `cursor-pointer` class to all clickable image thumbnails

## 3. Tests for Wiring

- [x] 3.1 Update ChatView tests: clicking an image opens lightbox
- [x] 3.2 Update ToolCallStep/ReadToolRenderer tests: clicking an image opens lightbox
- [x] 3.3 Update CommandInput tests: clicking a paste preview opens lightbox
