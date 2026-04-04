## Context

Agents editing dashboard UI code (React + Tailwind) have no visual feedback. The `pi-agent-browser` npm package already provides a `browser` tool that wraps `agent-browser` CLI — it handles browser lifecycle, inline screenshot return (base64 images in tool results), output truncation, auto-install, and session cleanup. What's missing is **workflow guidance**: when to use the tool, how to chain commands for common debugging scenarios, and dashboard-specific knowledge (URLs, component mappings, viewport presets).

The project already follows the Extension + Skill pattern (e.g., `ask-user-tool.ts` extension + skill docs). This change adds only the skill layer — no extension code.

## Goals / Non-Goals

**Goals:**
- Give agents a structured workflow for visually verifying UI changes
- Provide dashboard-specific recipes tied to actual component file paths
- Enable responsive testing across viewport sizes without browser restart
- Auto-detect the dashboard URL and mode (dev/production/Vite)
- Keep the skill lightweight — markdown files + one shell script

**Non-Goals:**
- Modifying or forking `pi-agent-browser` extension code
- Automated visual regression (screenshot diff tooling)
- CI/headless test pipelines
- Supporting Playwright as an alternative to `agent-browser`

## Decisions

### 1. Skill-only approach (no extension code)

**Decision**: Add only a skill (`.pi/skills/browser-visual-debug/`) — no custom extension or tool registration.

**Rationale**: `pi-agent-browser` already registers the `browser` tool with inline screenshot support, TUI rendering, auto-install, and cleanup. Duplicating or wrapping that would add complexity for no gain. The skill teaches *when and how* to use it.

**Alternative considered**: Writing a custom extension with dashboard-aware tools (e.g., `dashboard_screenshot` that auto-navigates to the right URL). Rejected — too coupled, and `agent-browser` commands are already simple enough.

### 2. `agent-browser` over `@playwright/cli`

**Decision**: Standardize on `agent-browser` (Vercel) as the underlying CLI.

**Rationale**: 90 npm releases vs 13 for `@playwright/cli` (alpha). Inline screenshot return works via `pi-agent-browser` extension. Runtime viewport changes via `agent-browser set viewport W H` — no browser restart needed. `--annotate` flag labels elements for vision models. Self-contained ~53MB binary.

**Alternative considered**: `@playwright/cli` via `pi-playwright` skill. Rejected — skill-only approach (no custom tool), saves screenshots to files instead of returning inline, less mature CLI.

### 3. `pi-agent-browser` as pi package dependency

**Decision**: Add `pi-agent-browser` to project-local `.pi/settings.json` packages array.

**Rationale**: Project-local keeps it scoped to this repo. The `pi install -l npm:pi-agent-browser` command handles dependency resolution. No need to pollute global extensions.

**Alternative considered**: Global install (`~/.pi/agent/settings.json`). Rejected — not all projects need browser tools.

### 4. Dashboard detection via shell script

**Decision**: A `detect-dashboard.sh` script reads `~/.pi/dashboard/config.json` for the port, probes the health endpoint, and checks for Vite dev server.

**Rationale**: Reuses the same config-reading pattern as `dashboard-api.sh` in the `pi-dashboard` skill. Shell script is simplest — no Node dependencies, works from skill recipes. Outputs machine-parseable key=value lines.

### 5. Skill file structure

**Decision**:
```
.pi/skills/browser-visual-debug/
├── SKILL.md                       # Core workflows + prerequisites
├── references/
│   ├── dashboard-recipes.md       # Dashboard-specific scenarios → commands → components
│   ├── responsive-testing.md      # Viewport presets + dark/light mode workflow
│   └── commands-cheatsheet.md     # agent-browser quick reference
└── scripts/
    └── detect-dashboard.sh        # URL + mode auto-detection
```

**Rationale**: Follows existing skill conventions (`pi-dashboard`, `nano-banana-imagegen`). References are loaded on demand — keeps SKILL.md concise. Scripts directory for executable helpers.

## Risks / Trade-offs

- **Vision model required** → Skill prerequisites section states this clearly. Non-vision models can still use `snapshot -i` (text-based accessibility tree) and `get text` for non-visual debugging.
- **SPA timing** → All recipes include `wait --load networkidle` after `open` and navigation. SKILL.md best practices section emphasizes this.
- **Upstream `pi-agent-browser` dependency** → If unmaintained, the `browser` tool still works as long as `agent-browser` CLI is installed. Skill recipes could fall back to raw `bash` tool with `agent-browser` commands.
- **Screenshot token cost** → Default viewport 1280×720 keeps images reasonable. Recipes suggest element-level screenshots (`browser screenshot --selector "#sidebar"`) when full-page is unnecessary.
