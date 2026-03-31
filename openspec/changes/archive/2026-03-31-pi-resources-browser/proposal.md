## Why

There's no way to see what pi extensions, skills, and prompts are installed for a project from the dashboard. Users must dig through `.pi/` directories, `~/.pi/agent/`, and npm/git package locations manually. Surfacing this in the dashboard gives visibility into what capabilities each workspace has and lets users read skill/prompt/extension source files directly.

## What Changes

- New server endpoint `GET /api/pi-resources?cwd=...` that scans all pi resource locations (local `.pi/`, global `~/.pi/agent/`, installed packages from `settings.json`) and returns discovered extensions, skills, and prompts with parsed metadata.
- New server-side resource scanner that implements full pi-compatible package resolution: npm global packages, git-cloned packages, local path packages, and conventional directory discovery.
- New `PiResourcesView` content area view showing resources grouped by scope (local, global, packages) with metadata (name, description, source, file path).
- ⚙️ button in folder header to navigate to the resources view for that workspace.
- "View" action on each resource opens the file in the existing `MarkdownPreviewView` (for `.md`) or as code (for `.ts`), using stack-based navigation (Chat → Resources → Preview, with back buttons).
- Periodic polling (~30s) to keep the resource list current, similar to OpenSpec polling.

## Capabilities

### New Capabilities
- `pi-resource-scanning`: Server-side discovery and metadata parsing of pi extensions, skills, and prompts across local, global, and package sources with full pi-compatible resolution.
- `pi-resources-view`: Content area view displaying discovered pi resources with metadata, grouped by scope, with navigation to file preview.

### Modified Capabilities
- `file-read-api`: Extend to allow reading files outside session cwd for global pi resources (`~/.pi/agent/`) and package locations (npm global, git clones).

## Impact

- **Server**: New resource scanner module, new REST endpoint, polling infrastructure.
- **Shared**: New types for `PiResource`, `PiResourcesResult` in `rest-api.ts` or new shared type file.
- **Client**: New `PiResourcesView.tsx` component, navigation stack support in App.tsx, new button in folder header area of `SessionList.tsx`.
- **Dependencies**: YAML frontmatter parsing (for SKILL.md and prompt metadata) — may use a lightweight parser or regex extraction.
