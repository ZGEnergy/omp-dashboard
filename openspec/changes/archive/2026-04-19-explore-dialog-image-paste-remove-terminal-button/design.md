## Context

`CommandInput` owns a ~50-line image-paste implementation: clipboard handler, base64 conversion, mime/size validation, pending-images state, thumbnail strip with remove buttons, and an error banner. `ExploreDialog` is a plain textarea modal — users asking the system to explore a visual bug cannot paste screenshots.

Separately, the folder action bar has a `+Terminal` quick-create button that predates the `Terminals(N)` tabbed view. Now that `Terminals(N)` handles creation inside its own tab bar, `+Terminal` is dead weight.

## Goals / Non-Goals

**Goals:**
- Reuse CommandInput's paste-image logic in ExploreDialog with zero behavior divergence.
- Keep the refactor additive: non-Explore callers of `onSendPrompt` remain source-compatible.
- Make the Explore dialog roomier for longer exploration prompts and image attachments.
- Remove the `+Terminal` button and all now-unused wiring.

**Non-Goals:**
- No file-picker / attachment button (paste-only, matching CommandInput parity).
- No drag-and-drop image support.
- No change to `send_prompt` protocol or server-side handling — backend already accepts `images`.
- No other Explore dialog redesign (placement, keyboard shortcuts unchanged).

## Decisions

### D1. Extract shared hook + component, don't copy-paste

**Decision:** Create `useImagePaste()` hook and `<ImagePreviewStrip>` component. Refactor `CommandInput` to use both. `ExploreDialog` consumes the same two.

**Rationale:**
- DRY (AGENTS.md guideline #8). Two callers = shared helper.
- Keeps bug fixes and future enhancements (drag-drop, file picker, larger limits) in one place.
- Hook surface is small and pure-ish: state + handlers, no coupling to textarea or send-action.

**Alternatives:**
- _Copy the logic into ExploreDialog._ Rejected: duplication, drift risk.
- _Full `<PromptComposer>` wrapper component._ Rejected: too large for this change; CommandInput has command-autocomplete, file-autocomplete, send/abort controls, and stop-state machine that don't belong in ExploreDialog.

### D2. Hook API shape

```ts
function useImagePaste(): {
  pendingImages: ImageContent[];
  imageError: string | null;
  handlePaste: (e: React.ClipboardEvent) => void;
  removeImage: (index: number) => void;
  clearImages: () => void;
}
```

`clearImages()` is called by the caller after a successful send. Hook does NOT own send logic — that's the caller's concern.

### D3. `onSendPrompt` signature widening

Change from `(text: string) => void` to `(text: string, images?: ImageContent[]) => void` in:
- `SessionHeader.Props.onSendPrompt`
- `MobileActionMenu.Props.onSendPrompt`
- `SessionOpenSpecActions.Props.onSendPrompt`

Since `images` is optional, existing callers that pass just text continue compiling and behaving identically. Only the two `ExploreDialog` callsites (in `SessionOpenSpecActions` and `MobileActionMenu`) forward images.

`useSessionActions.sendPrompt` already accepts `(text, images?)` and forwards to `send_prompt` WebSocket message (verified at `packages/client/src/hooks/useSessionActions.ts:95`).

### D4. Dialog sizing

- Container: `max-w-md` → `max-w-2xl` (448px → 672px).
- Textarea: `h-24` → `h-48` (96px → 192px).
- Mobile: existing `w-full mx-4` keeps it responsive; `max-w-2xl` only binds on wider viewports.
- No `max-h` constraint needed: content is bounded (textarea fixed height, up to a few thumbnails). If images stack past viewport height in rare cases, that's acceptable until we see the issue in practice.

### D5. Placeholder hint

Update Explore textarea placeholder from `"What do you want to explore?"` to `"What do you want to explore?  (paste images with Cmd/Ctrl+V)"` to surface the new capability. No separate help text / icon.

### D6. `+Terminal` removal scope

- Delete button JSX in `FolderActionBar.tsx`.
- Delete `onCreateTerminal` prop from `FolderActionBar.Props`.
- Update header doc-comment listing buttons.
- Trace the caller (sidebar) and remove the now-dead handler + any state/helper it only served.
- Update or remove the folder-action-bar spec's "+Terminal button with auto-navigation" requirement via delta.
- Update any existing tests that assert on `+Terminal`.

## Risks / Trade-offs

- **Risk:** Refactoring CommandInput breaks existing paste behavior. → **Mitigation:** Existing CommandInput tests for paste (covered by `image-paste` spec scenarios) must pass unchanged. TDD: run tests before and after refactor.
- **Risk:** Widening `onSendPrompt` type cascades into unrelated callsites. → **Mitigation:** Optional parameter; type is a strict superset of the old one. Verified call graph is small (~5 files).
- **Risk:** `+Terminal` removal breaks workflows of users who relied on the shortcut. → **Mitigation:** `Terminals(N)` → TerminalsView supports creating new terminals inside its tab bar; documented as the replacement path.
- **Trade-off:** `max-w-2xl` may feel large on medium laptop screens. Acceptable: modal is always dismissable and users with less screen real estate still see the full dialog (backdrop scroll not needed).

## Migration Plan

Pure client-side change. Ship in one commit; no server coordination. Rollback is a revert.

## Open Questions

_None._ All decisions above are firm for this change's scope.
