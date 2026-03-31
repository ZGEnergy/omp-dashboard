## Context

The dashboard currently has no visibility into what pi extensions, skills, and prompts are available for a workspace. Pi discovers these from three tiers: local (`.pi/` in project), global (`~/.pi/agent/`), and packages (npm, git, local path references in `settings.json`). Each type has metadata — skills have YAML frontmatter in SKILL.md, prompts have optional YAML frontmatter, extensions are bare `.ts` files but packages provide `name`/`description` via `package.json`.

The dashboard already has patterns for: periodic server-side polling (DirectoryService/OpenSpec, 30s interval), content area views (OpenSpecPreview, SettingsPanel, ZrokInstallGuide), file reading (`GET /api/file`), and markdown preview (MarkdownPreviewView).

## Goals / Non-Goals

**Goals:**
- Discover and display all pi resources (extensions, skills, prompts) for each workspace directory
- Full pi-compatible resolution: local `.pi/`, global `~/.pi/agent/`, and packages from both local and global `settings.json`
- Parse metadata (SKILL.md frontmatter, prompt frontmatter, package.json name/description)
- View resource files in existing MarkdownPreviewView with stack navigation
- Poll every 30s to stay current (resources may be added/removed)

**Non-Goals:**
- Editing or creating resources from the dashboard
- Installing/removing packages from the dashboard
- Showing resource enable/disable state from pi settings
- Walking ancestor directories for `.agents/skills/` (pi walks up to git root, but dashboard scopes to the cwd)

## Decisions

### 1. Server-side scanner as a standalone module (`pi-resource-scanner.ts`)

**Decision**: Create a pure function `scanPiResources(cwd: string)` that returns all discovered resources. Stateless, no class needed.

**Why**: Follows the existing pattern of `openspec-poller.ts` — a pure async function called by DirectoryService. Keeps complexity out of the service layer.

**Alternatives**: Could put scanning logic in DirectoryService directly, but that module is already 100+ lines. Separate module is cleaner and testable.

### 2. Integrate polling into existing DirectoryService

**Decision**: Add `getPiResources(cwd)` and `refreshPiResources(cwd)` to DirectoryService, reuse the same 30s poll timer that already polls OpenSpec.

**Why**: Avoids a second timer. DirectoryService already manages per-cwd polling and knows when directories are added/removed.

**Alternative**: Separate polling service — rejected because it duplicates timer management.

### 3. YAML frontmatter parsing with regex

**Decision**: Parse SKILL.md and prompt frontmatter using simple regex extraction (match `---\n...\n---` block, extract `name:`, `description:` lines) rather than adding a YAML parsing dependency.

**Why**: We only need `name` and `description` fields. The existing codebase already uses regex for frontmatter stripping in `prompt-expander.ts`. No new dependency needed.

**Alternative**: `gray-matter` or `js-yaml` npm package — rejected to keep dependencies minimal for simple field extraction.

### 4. Package resolution: settings.json → filesystem paths

**Decision**: Read both `<cwd>/.pi/settings.json` and `~/.pi/agent/settings.json`, resolve each `packages[]` entry to a filesystem path:
- `npm:<name>` → find via `npm root -g` + `/node_modules/<name>/`
- `git:<url>` → `~/.pi/agent/git/<host>/<path>/` (global) or `<cwd>/.pi/git/<host>/<path>/` (local)
- Relative/absolute paths → resolve relative to the settings file location

Then read `package.json` for `pi.extensions`, `pi.skills`, `pi.prompts` arrays, falling back to conventional directories (`extensions/`, `skills/`, `prompts/`).

**Why**: Matches pi's own resolution logic. The three source types are well-documented in packages.md.

**Alternative**: Shell out to `pi list` — rejected because it requires pi to be running and would be slow.

### 5. Extend `/api/file` to allow resource file reads

**Decision**: Add a new endpoint `GET /api/pi-resource-file?path=<absolute>` (localhost-only) that reads files only if the path is within a known pi resource location (`.pi/`, `~/.pi/agent/`, resolved package dirs). This avoids weakening the existing `/api/file` security check.

**Why**: The existing `/api/file` restricts reads to session cwd. Global resources and npm packages live outside that. A separate endpoint with its own allowlist is safer than relaxing the general file endpoint.

**Alternative**: Relax `/api/file` to allow `~/.pi/` paths — rejected because it broadens attack surface.

### 6. Content area view with stack navigation

**Decision**: Add a `piResourcesView` state alongside the existing `previewState` in App.tsx. Navigation stack: chat → PiResourcesView → MarkdownPreviewView. The resources view sets `previewState` to navigate to file preview; clearing preview returns to resources; clearing resources returns to chat.

**Why**: Follows the existing pattern where `previewState` controls OpenSpec preview. Adding a parallel state for resources view is minimal — just one more condition in the render logic.

**Alternative**: URL-based routing (`/resources/:cwd`) — possible but the existing preview pattern doesn't use URL routing, so this would be inconsistent.

### 7. Folder header button placement

**Decision**: Add a small icon button (puzzle piece or similar) next to the existing [+ Session] [+ Terminal] buttons in the folder header row. Clicking it sets `piResourcesView` state with the folder's `cwd`.

**Why**: Consistent with existing buttons in that row. Non-intrusive.

## Risks / Trade-offs

- **npm root resolution** — `npm root -g` is a shell call. Cache the result since it doesn't change during a server run. [Risk: slow first call] → Mitigation: call once on first request, cache indefinitely.
- **Package path resolution edge cases** — Filtered packages (object form with `extensions: []`) and `!exclusion` patterns are complex. [Risk: incomplete implementation] → Mitigation: implement basic resolution first (string-form packages), add filter support as a follow-up if needed.
- **Large number of resources** — Some projects may have many skills from packages. [Risk: slow scan] → Mitigation: the scan is I/O bound (readdir + file reads), caching at 30s makes this fine.
- **Stale npm global path** — If user installs/removes npm packages, cached `npm root -g` is still valid but package may not exist. [Risk: broken entries] → Mitigation: catch ENOENT during scan, skip missing packages.
