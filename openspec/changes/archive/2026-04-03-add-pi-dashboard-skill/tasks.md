## 1. REST Wrappers for WebSocket Operations
- [x] 1.1 Add `POST /api/session/:id/prompt` endpoint (send prompt to session via pi-gateway)
- [x] 1.2 Add `POST /api/session/:id/abort` endpoint
- [x] 1.3 Add `POST /api/session/:id/shutdown` endpoint (shutdown pi session, not server)
- [x] 1.4 Add `POST /api/session/:id/rename` endpoint
- [x] 1.5 Add `POST /api/session/:id/hide` and `unhide` endpoints
- [x] 1.6 Add `POST /api/session/spawn` endpoint (spawn new session in cwd)
- [x] 1.7 Add `POST /api/session/:id/resume` endpoint (continue or fork)
- [x] 1.8 Add `POST /api/session/:id/flow-control` endpoint (abort/toggle_autonomous)
- [x] 1.9 Add `POST /api/session/:id/model` endpoint (set provider + model)
- [x] 1.10 Add `POST /api/session/:id/thinking-level` endpoint
- [x] 1.11 Add `POST /api/session/:id/attach-proposal` and `detach-proposal` endpoints
- [x] 1.12 Write tests for all new REST endpoints

## 2. Bundled Skill
- [x] 2.1 Create `skills/pi-dashboard/SKILL.md` with auto-discovery, capability sections, auth handling
- [x] 2.2 Create `skills/pi-dashboard/references/api-reference.md` — full REST API reference
- [x] 2.3 Create `skills/pi-dashboard/references/recipes.md` — orchestration recipes
- [x] 2.4 Create `skills/pi-dashboard/scripts/dashboard-api.sh` — helper with port detection and auth

## 3. Package Integration
- [x] 3.1 Add `skills/` to `files` in package.json
- [x] 3.2 Add `pi.skills` entry pointing to `skills/pi-dashboard`
- [x] 3.3 Update AGENTS.md key files table with new skill files
- [x] 3.4 Update docs/architecture.md with REST wrapper documentation
