## Why

The "Pin Directory" dialog (`PinDirectoryDialog.tsx`) only has a text input for typing a path, which is error-prone and requires users to know exact paths. A unified path picker — combining a typeahead input with a visual directory list (like zsh tab completion) — lets users type fast when they know the path and browse visually when they don't, in one seamless widget.

## What Changes

- **Directory listing API**: New `GET /api/browse?path=<dir>` endpoint (localhost-only) that returns directory entries (folders only) for the given path, with parent path for navigation.
- **PathPicker component**: Reusable keyboard-first widget combining a text input with a fixed-height directory list below it. Typing filters the list (client-side), Tab descends into the highlighted entry, Enter confirms the current path. Clicking a list entry descends into it. Focus never leaves the input — the list is a visual projection, not a focusable element.
- **Integrate with PinDirectoryDialog**: Replace the plain text input in `PinDirectoryDialog.tsx` with the PathPicker component. The dialog becomes a thin wrapper.

## Capabilities

### New Capabilities

- `filesystem-browser`: PathPicker component and browse API endpoint — a reusable, keyboard-first path picker for navigating the host filesystem.

### Modified Capabilities

- `pinned-directories-ui`: Pin directory dialog uses PathPicker for unified type-and-browse directory selection.

## Impact

- **Files**: New `src/client/components/PathPicker.tsx`, new `src/client/lib/browse-api.ts`, modified `src/client/components/PinDirectoryDialog.tsx`, `src/server/server.ts` (browse endpoint).
- **Tests**: PathPicker component tests, browse endpoint test, updated PinDirectoryDialog tests.
- **Security**: Browse endpoint is localhost-only. Directory listing restricted to folders (no file content exposure).
