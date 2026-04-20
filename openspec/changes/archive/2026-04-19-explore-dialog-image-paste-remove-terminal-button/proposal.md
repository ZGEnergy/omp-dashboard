## Why

Two small UX improvements to the dashboard sidebar and OpenSpec dialogs:

1. The `+Terminal` quick-create button in the folder action bar is deprecated — users create and manage terminals through `Terminals(N)` → TerminalsView, making the `+Terminal` button redundant clutter.
2. The Explore dialog currently only accepts plain text. When users want to explore a visual bug, paste a screenshot, or share a design mockup, they have to open a full session first — the Explore dialog can't accept images. The chat input (`CommandInput`) already supports clipboard image paste, so the missing capability is just plumbing, not new functionality.

## What Changes

- **BREAKING (internal prop only):** Remove `+Terminal` button from `FolderActionBar`. Drop the `onCreateTerminal` prop; sidebar callers stop threading the handler through.
- Extract the clipboard-image-paste logic from `CommandInput` into a reusable `useImagePaste()` hook, and extract the image-preview/error strip into a reusable `<ImagePreviewStrip>` component. Refactor `CommandInput` to use both (no behavior change).
- Enlarge the Explore dialog: `max-w-md` → `max-w-2xl`, textarea `h-24` → `h-48`.
- Add clipboard image paste to the Explore dialog using the shared hook + component. Same supported types (`image/png|jpeg|gif|webp`), same 10MB limit, same thumbnail+remove UI.
- Extend `onSendPrompt` signature through the Explore call chain to pass an optional `images?: ImageContent[]` alongside the prompt text. The underlying `send_prompt` WebSocket message already supports images.

## Capabilities

### New Capabilities
_None._ All work lives inside existing capabilities.

### Modified Capabilities
- `image-paste`: generalize from "chat input only" to "shared between chat input and OpenSpec Explore dialog". Same semantics, broader reach.
- `openspec-dialogs`: Explore dialog SHALL accept pasted images, SHALL render at a larger size, and SHALL include attached images in the sent `send_prompt`.
- `folder-action-bar`: remove the `+Terminal` button requirement; the action bar no longer contains it.

## Impact

**Code:**
- `packages/client/src/hooks/useImagePaste.ts` — new shared hook
- `packages/client/src/components/ImagePreviewStrip.tsx` — new shared component
- `packages/client/src/components/CommandInput.tsx` — refactor to use shared hook + component
- `packages/client/src/components/ExploreDialog.tsx` — enlarge, add image paste, extend `onSend` signature
- `packages/client/src/components/SessionOpenSpecActions.tsx` — forward images in ExploreDialog callsites
- `packages/client/src/components/MobileActionMenu.tsx` — forward images in ExploreDialog callsite
- `packages/client/src/components/SessionHeader.tsx` — widen `onSendPrompt` type to accept optional images
- `packages/client/src/components/FolderActionBar.tsx` — remove `+Terminal` button + `onCreateTerminal` prop, update header doc-comment
- Sidebar caller of `FolderActionBar` — drop the dead `onCreateTerminal` handler
- Existing tests for `CommandInput`, `ExploreDialog`, and `FolderActionBar` — update snapshots/assertions

**APIs:** None. `send_prompt` WebSocket message already accepts `images`.

**Dependencies:** None.

**User-visible:** Sidebar has one fewer button; Explore dialog is noticeably larger and supports paste-image attachments.
