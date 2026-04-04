## 1. Package Setup

- [ ] 1.1 Create `.pi/settings.json` (or update if exists) with `"packages": ["npm:pi-agent-browser"]`
- [ ] 1.2 Verify `pi-agent-browser` installs and `browser` tool is available

## 2. Skill Skeleton

- [ ] 2.1 Create `.pi/skills/browser-visual-debug/SKILL.md` with metadata header (name, description, license)
- [ ] 2.2 Add prerequisites section (pi-agent-browser package, vision-capable model)
- [ ] 2.3 Add quick reference section (detect dashboard, open, wait, screenshot)
- [ ] 2.4 Add four core workflow sections: visual verification, interactive debugging, responsive checks, console error hunting
- [ ] 2.5 Add best practices section (wait for networkidle, screenshot after mutations, use --annotate, close when done)

## 3. Dashboard Detection Script

- [ ] 3.1 Create `scripts/detect-dashboard.sh` that reads port from `~/.pi/dashboard/config.json`
- [ ] 3.2 Add health endpoint probe (`/api/health`) with mode detection
- [ ] 3.3 Add Vite dev server probe (port 5173)
- [ ] 3.4 Output key=value format: DASHBOARD_URL, MODE, VITE_URL (or not-running messages)

## 4. References

- [ ] 4.1 Create `references/dashboard-recipes.md` with recipes: session card rendering, chat view scrolling, flow dashboard cards, settings panel, mobile shell, terminal view — each with command sequence and component file paths
- [ ] 4.2 Create `references/responsive-testing.md` with viewport presets table, runtime viewport switching workflow, and dark/light mode testing
- [ ] 4.3 Create `references/commands-cheatsheet.md` with quick-reference table of core agent-browser commands

## 5. Documentation

- [ ] 5.1 Add skill entry to AGENTS.md key files table
- [ ] 5.2 Add `browser-visual-debug` to available_skills in AGENTS.md
