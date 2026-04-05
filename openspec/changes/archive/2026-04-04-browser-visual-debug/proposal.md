## Why

Agents working on the dashboard have no way to see the rendered UI. They edit React components, Tailwind classes, and layout logic blind — relying entirely on code reasoning to predict visual outcomes. When something looks wrong (misaligned, blank, broken on mobile), the only feedback loop is a human describing what they see.

A browser automation skill would give agents "eyes" — the ability to open the dashboard, take screenshots, see them via vision, and reason about the actual rendered result. This closes the visual feedback loop that humans take for granted.

## What Changes

- Install `pi-agent-browser` npm package (registers the `browser` tool via a pi extension).
- Add a companion **skill** (`.pi/skills/browser-visual-debug/`) that teaches agents when and how to use the browser tool effectively, with dashboard-specific recipes.
- Add a `detect-dashboard.sh` script that probes the dashboard server URL, mode (dev/production), and Vite dev server status.

The skill does NOT register tools — it layers workflow guidance and recipes on top of the existing `browser` tool from `pi-agent-browser`.

## Capabilities

### New Capabilities

- `browser-visual-debug`: Skill providing browser-based visual debugging workflows — screenshot verification, interactive element inspection, responsive testing across viewports, console/network error hunting, and dashboard-specific recipes tied to component files.

### Modified Capabilities

_(none)_

## Scope

### In Scope

- `pi-agent-browser` package installation (settings.json or package.json)
- SKILL.md with core workflows (visual verification, interactive debugging, responsive checks, console error hunting)
- Dashboard-specific recipes mapping debugging scenarios → browser commands → component files
- Responsive testing reference with viewport presets and `agent-browser set viewport` workflow
- `detect-dashboard.sh` script for URL/mode auto-detection
- agent-browser commands cheatsheet reference

### Out of Scope

- Forking or modifying `pi-agent-browser` extension code
- Automated visual regression testing (screenshot diffing)
- CI integration or headless test suites
- Video/trace recording (future enhancement)
- Playwright as an alternative backend — we're standardizing on `agent-browser`

## Risks

- **Vision model required**: Screenshots only work with vision-capable models (Claude Sonnet/Opus, GPT-4o, Gemini Pro). The skill must document this prerequisite clearly.
- **agent-browser install weight**: The CLI is ~53MB. First-time setup also downloads Chromium. The auto-install prompt in `pi-agent-browser` handles this gracefully.
- **SPA timing**: Dashboard is a React SPA — agents must wait for `networkidle` after navigation or the screenshot may capture a loading state. Recipes must emphasize this.
- **Upstream dependency**: `pi-agent-browser` is a third-party package. If it breaks or goes unmaintained, the skill still works with manual `agent-browser` CLI usage via bash.
