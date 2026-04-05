## Why

OpenSpec has 107+ main specs in `openspec/specs/` but no way to browse them from the dashboard. Bulk Archive lives in the folder header where it's less discoverable — it makes more sense on session cards where users interact with changes. The markdown preview lacks text search, making it hard to find content in large documents.

## What Changes

- **Move Bulk Archive from folder header to session card**: The Bulk Archive button moves from `FolderOpenSpecSection` to `SessionOpenSpecActions`. It only appears when at least one completed change exists in the folder. The folder header loses its Bulk Archive button.
- **Add Specs Browser entry point on folder header**: A new "Specs" button on the right side of the OpenSpec collapsible header opens a full specs browser in the content area. It fetches all `openspec/specs/*/spec.md` files, concatenates them with spec-name headings as separators, and provides a combobox to jump to any spec by name.
- **Add text search to MarkdownPreviewView**: A reusable search overlay that highlights matches in rendered markdown and provides prev/next navigation. Uses exact substring matching first; falls back to fuse.js fuzzy matching only when no exact matches are found. Available in any markdown preview, including the new specs browser.

## Capabilities

### New Capabilities
- `specs-browser`: Browsing main OpenSpec specs from the dashboard with concatenated view, combobox jump-to, and scroll anchors
- `markdown-fuzzy-search`: Reusable text search overlay for MarkdownPreviewView — exact-first with fuse.js fuzzy fallback

### Modified Capabilities
- `openspec-folder-section`: Remove Bulk Archive button from folder header; add Specs button on the right side of the collapsible header
- `openspec-attach-combo`: Add Bulk Archive button to session-level actions, visible only when completed changes exist in the folder

## Impact

- **Client components**: `FolderOpenSpecSection.tsx`, `SessionOpenSpecActions.tsx`, `MarkdownPreviewView.tsx`, new `SpecsBrowserView.tsx`, new `MarkdownSearch.tsx`
- **Client hooks**: New `useMainSpecsReader.ts` hook for fetching and concatenating main specs
- **Dependencies**: Add `fuse.js` and `rehype-raw` npm packages
- **Server**: No changes — reuses existing `/api/file` endpoint for directory listing and file content
- **Props threading**: `onBulkArchive` callback moves from folder-level to session-level in `SessionList.tsx` and `App.tsx`
