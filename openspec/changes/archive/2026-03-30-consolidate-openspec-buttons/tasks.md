## 1. ArtifactLettersButton component

- [x] 1.1 Add `ArtifactLettersButton` to `src/client/components/openspec-helpers.tsx` — single `<button>` rendering all artifact letters with per-letter status colors, clicking calls `onReadArtifact(changeName, "proposal")`
- [x] 1.2 Add tests for `ArtifactLettersButton` (renders letters, applies colors, click calls handler with proposal)

## 2. SessionOpenSpecActions changes

- [x] 2.1 Add "+ Change" and "Explore" buttons to unattached active state, inline with attach combo. Include `NewChangeDialog` and `ExploreDialog` state management
- [x] 2.2 Replace `ArtifactLetters` with `ArtifactLettersButton` in attached badge line
- [x] 2.3 Remove "Read" button from attached action row
- [x] 2.4 Update `SessionOpenSpecActions.test.tsx` — test "+ Change" and "Explore" in unattached state, PDST single button, no "Read" button, no "+ Change" when attached or ended

## 3. FolderOpenSpecSection changes

- [x] 3.1 Remove "+ Change" button, `NewChangeDialog` import, `newChangeOpen` state, `sessions` prop, `onSendPrompt` prop, `canCreateNew`
- [x] 3.2 Replace `ArtifactLetters` with `ArtifactLettersButton` in expanded change list
- [x] 3.3 Update `FolderOpenSpecSection.test.tsx` — remove "+ Change" tests, update props, test PDST single button

## 4. Parent component cleanup

- [x] 4.1 Remove `sessions` and `onSendPrompt` props from `FolderOpenSpecSection` call sites (search for `<FolderOpenSpecSection`)

## 5. Discard obsolete change

- [x] 5.1 Delete `openspec/changes/new-change-button-in-header/` directory
