## Context

The OpenSpec UI has session-level actions ("+ Change", "Explore") placed in the folder-level header, creating confusing UX. The PDST artifact letters are individual tiny buttons that are hard to tap on mobile. The "Read" button duplicates PDST functionality. This change consolidates button placement and simplifies the click targets.

Current components:
- `FolderOpenSpecSection` — folder header with Refresh, Bulk Archive, + Change, and expanded change list with individual PDST letter buttons
- `SessionOpenSpecActions` — attach combo (unattached) or badge + action buttons (attached), with individual PDST letter buttons and a Read button
- `ArtifactLetters` in `openspec-helpers.tsx` — renders individual clickable letter buttons

## Goals / Non-Goals

**Goals:**
- Move "+ Change" and "Explore" to `SessionOpenSpecActions` unattached state
- Remove session-dependent props from `FolderOpenSpecSection`
- Replace individual PDST letter buttons with a single combined button everywhere
- Remove redundant "Read" button from attached state

**Non-Goals:**
- Changing the attach/detach protocol
- Changing the PDST color scheme
- Adding new OpenSpec commands or capabilities

## Decisions

### 1. ArtifactLettersButton as a new component in openspec-helpers.tsx

Create `ArtifactLettersButton` alongside the existing `ArtifactLetters`. It renders all letters in a single `<button>` element, each letter wrapped in a `<span>` with its status color. Clicking calls `onReadArtifact(changeName, "proposal")` — always navigates to proposal since the content view handles artifact navigation.

**Why a new component vs modifying ArtifactLetters**: Keeps the change minimal. `ArtifactLetters` can be removed later if nothing else uses it, but for now a clean new component avoids breaking anything.

### 2. "+ Change" and "Explore" inline with attach combo

In the unattached/active state, render the combo box, "+ Change" button, and "Explore" button in a single flex row. The `NewChangeDialog` and `ExploreDialog` state moves into `SessionOpenSpecActions`. The `ExploreDialog` is called with an empty `changeName` for general explore mode.

### 3. FolderOpenSpecSection cleanup

Remove: `+ Change` button, `NewChangeDialog` import, `newChangeOpen` state, `sessions` prop, `onSendPrompt` prop, `canCreateNew` derived value. The `onNavigateToSession` prop stays (used by session links in expanded list).

### 4. Replace ArtifactLetters usage with ArtifactLettersButton

Both `FolderOpenSpecSection` (in expanded change list) and `SessionOpenSpecActions` (in attached badge line) switch from `ArtifactLetters` to `ArtifactLettersButton`.

## Risks / Trade-offs

- **[Lost per-artifact navigation from PDST]** → Mitigated: content view already provides artifact-level navigation. The PDST button is just a quick entry point.
- **[ExploreDialog with empty changeName]** → The explore skill handles optional change names; no server-side change needed.
