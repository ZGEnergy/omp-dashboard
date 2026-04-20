## 1. Extract shared image-paste logic (TDD)

- [x] 1.1 Write tests for `useImagePaste()` hook: paste supported image → added to `pendingImages`; paste unsupported mime → `imageError` set with message + auto-clear after 3s; paste >10MB → `imageError` "Image too large (max 10MB)"; `removeImage(i)` removes at index; `clearImages()` empties list
- [x] 1.2 Create `packages/client/src/hooks/useImagePaste.ts` implementing the hook (extract logic from `CommandInput` lines ~35–36, 77–78, 244–281); export `MAX_IMAGE_SIZE` and `SUPPORTED_IMAGE_TYPES` constants from the hook module
- [x] 1.3 Write tests for `<ImagePreviewStrip>` component: renders error banner when `error` prop set; renders N thumbnails from `images` prop; clicking remove button fires `onRemove(i)`; clicking thumbnail opens `ImageLightbox`
- [x] 1.4 Create `packages/client/src/components/ImagePreviewStrip.tsx` implementing the component (extract markup from `CommandInput` lines ~333–362)
- [x] 1.5 Run `npm test` — new hook + component tests pass

## 2. Refactor CommandInput to use shared pieces

- [x] 2.1 Replace inline paste state + handlers in `CommandInput.tsx` with `useImagePaste()` call
- [x] 2.2 Replace inline image-preview markup in `CommandInput.tsx` with `<ImagePreviewStrip>` usage
- [x] 2.3 Run existing `CommandInput` tests — all pass unchanged
- [x] 2.4 Manual smoke-test in dev: paste image in chat input, verify thumbnail, send, verify clears

## 3. Widen `onSendPrompt` signature

- [x] 3.1 Change `onSendPrompt?: (text: string) => void` → `onSendPrompt?: (text: string, images?: ImageContent[]) => void` in `SessionHeader.tsx` (Props and nested `mobileActions` type)
- [x] 3.2 Same widening in `MobileActionMenu.tsx` Props
- [x] 3.3 Same widening in `SessionOpenSpecActions.tsx` Props
- [x] 3.4 Verify `useSessionActions.sendPrompt` already accepts `(text, images?)` and forwards to `send_prompt` WebSocket message (no change expected at `useSessionActions.ts:95`)
- [x] 3.5 Run `npm test` + `tsc --noEmit` — clean

## 4. Upgrade ExploreDialog

- [x] 4.1 Write tests for new ExploreDialog behavior: renders `max-w-2xl` container and `h-48` textarea; paste image → thumbnail visible; send with text + images → `onSend(text, images)` called with both; send after paste clears images on close; remove thumbnail works; cancel discards images
- [x] 4.2 Update `ExploreDialog.tsx`:
  - Container: `max-w-md` → `max-w-2xl`
  - Textarea: `h-24` → `h-48`
  - Placeholder: `"What do you want to explore?  (paste images with Cmd/Ctrl+V)"`
  - Add `onPaste={handlePaste}` and integrate `useImagePaste()` + `<ImagePreviewStrip>`
  - Change prop type: `onSend: (text: string, images?: ImageContent[]) => void`
  - In `handleSend`, pass `pendingImages` through and call `clearImages()` after
- [x] 4.3 Run existing `Dialogs.test.tsx` ExploreDialog tests — update any that assert on old size classes; new tests from 4.1 pass

## 5. Forward images through Explore callsites

- [x] 5.1 In `SessionOpenSpecActions.tsx`, update both `ExploreDialog` callsites to forward images: `onSend={(text, images) => onSendPrompt(\`/skill:openspec-explore${attached ? " " + attached : ""}\n${text}\`, images)}`
- [x] 5.2 In `MobileActionMenu.tsx`, update the `ExploreDialog` callsite similarly
- [x] 5.3 Verify the App-level `onSendPrompt` wiring routes through `useSessionActions.sendPrompt(text, images)` unchanged
- [x] 5.4 Manual smoke-test in dev: open Explore dialog, paste image, send, verify image appears in the pi session's prompt

## 6. Remove +Terminal button

- [x] 6.1 Write/update tests for `FolderActionBar`: button list no longer contains `+Terminal`; component does not accept `onCreateTerminal` prop
- [x] 6.2 In `FolderActionBar.tsx`:
  - Remove the `+Terminal` button JSX (lines ~78–87)
  - Remove `onCreateTerminal` from Props interface
  - Remove `onCreateTerminal` from destructured args
  - Update header comment listing buttons
- [x] 6.3 Trace the `FolderActionBar` call site (sidebar folder group) and remove the `onCreateTerminal` handler prop + any state/helpers only used for that button
- [x] 6.4 Grep for remaining `onCreateTerminal` references — none should remain in client source
- [x] 6.5 Run `npm test` + `tsc --noEmit` — clean

## 7. Spec + docs updates

- [x] 7.1 `openspec validate explore-dialog-image-paste-remove-terminal-button --strict` passes
- [x] 7.2 Run full `npm test` — green
- [x] 7.3 Update `AGENTS.md` "Key Files" table entries for `CommandInput.tsx`, `ExploreDialog.tsx`, `FolderActionBar.tsx`; add rows for `useImagePaste.ts` and `ImagePreviewStrip.tsx`
- [x] 7.4 Update `docs/architecture.md` and `README.md` if they reference `+Terminal` or Explore dialog size

## 8. Build + restart

- [x] 8.1 `npm run build` (client)
- [x] 8.2 `curl -X POST http://localhost:8000/api/restart` (server)
- [x] 8.3 Manual end-to-end check: +Terminal gone from sidebar; Explore dialog is larger and accepts pasted images
