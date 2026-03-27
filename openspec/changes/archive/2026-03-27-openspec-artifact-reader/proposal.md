## Why

OpenSpec change cards show artifact status letters (P S D T) but there's no way to read the actual content of those artifacts from the dashboard. Users must switch to a terminal or editor to read proposals, designs, specs, and tasks. Adding an in-dashboard markdown reader closes this gap and makes the dashboard a self-contained tool for monitoring OpenSpec workflows.

## What Changes

- Add a generic REST endpoint for reading files (and listing directories) from session working directories
- Make artifact status letters (P S D T) clickable — clicking opens a rich markdown preview of that artifact
- Add a "Read" action button on each change card that opens the first available artifact
- Replace the chat view area with a full markdown preview view (hiding StatusBar and CommandInput)
- A back button restores the chat view
- For the "S" (specs) artifact, concatenate all spec files under the change's `specs/` directory into a single scrollable view with section headers
- The markdown preview component is generic and reusable for any markdown file, not just OpenSpec artifacts

## Capabilities

### New Capabilities
- `file-read-api`: REST endpoint to read file content or list directory entries from a session's working directory, with localhost and path-containment guards
- `markdown-preview-view`: Generic reusable markdown preview component with back button, optional tab bar, and scrollable rendered content using the existing MarkdownContent component
- `openspec-artifact-reader`: Clickable artifact letters and Read button on change cards that open artifact markdown in the preview view, with tab navigation between P/S/D/T and automatic concatenation of spec files

### Modified Capabilities
- `openspec-card-section`: Artifact letters become clickable buttons; a new "Read" action button is added to each change card

## Impact

- **Server**: New `GET /api/file` route in `src/server/server.ts` with localhost guard and path validation
- **Shared**: New response types in `src/shared/rest-api.ts`
- **Client components modified**: `OpenSpecSection.tsx` (clickable letters + Read button + new callback), `SessionCard.tsx` (pass through callback), `SessionList.tsx` (pass through callback), `App.tsx` (preview state management, conditional view rendering)
- **Client components added**: `MarkdownPreviewView.tsx` (generic), `useOpenSpecReader.ts` hook (artifact path mapping, fetching, specs concatenation)
- **No breaking changes** — all existing behavior preserved, this is purely additive
