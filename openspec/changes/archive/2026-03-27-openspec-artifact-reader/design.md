## Context

OpenSpec change cards in the sidebar show artifact status letters (P S D T) as colored text. Users can trigger actions (Continue, FF, Apply, Archive) but cannot read artifact content without leaving the dashboard. The existing `MarkdownContent` component already renders rich markdown with syntax highlighting, GFM tables, and copy buttons.

The main area currently always shows `ChatView + StatusBar + CommandInput` when a session is selected. There is no view-switching mechanism.

## Goals / Non-Goals

**Goals:**
- Let users read OpenSpec artifact markdown directly in the dashboard
- Build a generic markdown preview component reusable for any markdown file
- Add a file-read REST endpoint scoped to session working directories
- Keep the change minimal — reuse existing `MarkdownContent`, add one view state

**Non-Goals:**
- Editing markdown files (read-only preview)
- Live-updating preview when files change on disk (manual refresh or re-click)
- Previewing non-markdown file types (images, binary, etc.)
- Adding a generic file browser (just direct file reads by path)

## Decisions

### Decision: Generic REST file endpoint over OpenSpec-specific endpoint
Add `GET /api/file?cwd=...&path=...` that returns file content or directory listing based on what the path points to. This keeps the API generic and reusable for future features (README preview, file browser) rather than hard-coding OpenSpec paths.

**Alternative considered:** An OpenSpec-specific endpoint (`GET /api/openspec/artifact?change=...&artifact=...`). Rejected because it limits reuse and the generic approach is equally simple.

### Decision: Server reads files directly
The dashboard server runs on the same machine as the session working directories. It can read files directly using `fs.readFile` with path validation. No need to proxy through the extension via WebSocket.

**Alternative considered:** Forwarding file-read requests through the extension WebSocket. Rejected because it adds complexity (request/response correlation over WSocket) when the server already has filesystem access.

### Decision: View state in App.tsx, not URL routing
Add a `previewState` variable to App.tsx. When set, render `MarkdownPreviewView` instead of `ChatView + StatusBar + CommandInput`. When null, show the normal chat. The session route (`/session/:id`) stays the same — preview is ephemeral UI state, not a routable view.

**Alternative considered:** Adding a URL route like `/session/:id/preview/...`. Rejected because the preview is transient — back button should restore chat, not add browser history entries. Simple state is simpler.

### Decision: Client-side specs concatenation
For the "S" artifact, the client fetches the `specs/` directory listing, then fetches each `spec.md` file individually, and concatenates them with `# <name>` headers and `---` separators. This keeps the server endpoint generic.

**Alternative considered:** Server-side concatenation endpoint. Rejected because it's a special case that complicates the generic API. The number of spec files per change is small (typically 1-5), so multiple fetches are fine.

### Decision: MarkdownPreviewView as a generic component with optional tabs
The preview component accepts `content`, `title`, `onBack`, and optional `tabs` props. It knows nothing about OpenSpec. The OpenSpec-specific logic (artifact-to-path mapping, tab definitions, specs concatenation) lives in a `useOpenSpecReader` hook that feeds the generic component.

### Decision: Clickable letters + explicit Read button
Artifact letters become clickable buttons that open that specific artifact directly. A "Read" action button opens the first available artifact. Both approaches serve different user intents — direct access vs. "show me everything starting from the beginning."

## Risks / Trade-offs

- **[Security: arbitrary file read]** → Mitigated by three guards: localhost-only, cwd must match a known session, resolved path must stay inside cwd. No path traversal possible.
- **[Multiple fetches for specs]** → Acceptable because spec count per change is small (1-5 files). Could optimize later with a batch endpoint if needed.
- **[No live refresh]** → Users must click a letter again or switch tabs to refresh content. Acceptable for a read-only viewer. Could add a refresh button later.
- **[Large files]** → No size limit on the endpoint. Markdown files in OpenSpec are typically small. Could add a response size cap later if abuse becomes an issue.
