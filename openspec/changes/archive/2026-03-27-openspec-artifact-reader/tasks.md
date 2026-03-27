## 1. File Read API

- [x] 1.1 Add `FileReadResponse` types to `src/shared/rest-api.ts` (file content and directory listing variants)
- [x] 1.2 Add `GET /api/file` endpoint to `src/server/server.ts` with localhost guard, session cwd validation, path containment check, and file/directory response
- [x] 1.3 Write tests for the file endpoint: valid file read, directory listing, missing params, path traversal rejection, unknown cwd rejection

## 2. Markdown Preview Component

- [x] 2.1 Create `src/client/components/MarkdownPreviewView.tsx` — generic component with back button, title, optional tab bar, loading/error states, and scrollable MarkdownContent
- [x] 2.2 Write tests for MarkdownPreviewView: renders content, shows tabs, loading state, error state, back button callback

## 3. OpenSpec Reader Hook

- [x] 3.1 Create `src/client/hooks/useOpenSpecReader.ts` — maps artifact IDs to file paths, fetches content via `/api/file`, concatenates specs with headers
- [x] 3.2 Write tests for useOpenSpecReader: single file fetch, specs directory concatenation, error handling

## 4. Clickable Artifact Letters and Read Button

- [x] 4.1 Update `ArtifactLetters` in `FolderOpenSpecSection.tsx` — change `<span>` to `<button>` with `onClick` calling `onReadArtifact(changeName, artifactId)`
- [x] 4.2 Add "Read" `ActionButton` to `SessionOpenSpecActions` that calls `onReadArtifact(changeName, firstArtifactId)`, hidden when no artifacts
- [x] 4.3 Add `onReadArtifact` prop to `FolderOpenSpecSection` and `SessionOpenSpecActions`, thread through `ChangeCard` and `ArtifactLetters`
- [x] 4.4 Update OpenSpecSection tests for clickable letters and Read button

## 5. App View Integration

- [x] 5.1 Add `previewState` to `App.tsx` and `onReadArtifact` handler that sets it with cwd + changeName + artifactId
- [x] 5.2 Thread `onReadArtifact` callback from App → SessionList → SessionCard → OpenSpecSection
- [x] 5.3 Conditionally render `MarkdownPreviewView` (with `useOpenSpecReader`) instead of ChatView + StatusBar + CommandInput when `previewState` is set
- [x] 5.4 Clear `previewState` on back button click and on session change

## 6. Documentation

- [x] 6.1 Update AGENTS.md key files table with new components and hook
- [x] 6.2 Update docs/architecture.md with file read endpoint and preview view flow
