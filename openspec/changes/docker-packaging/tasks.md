## 1. Dockerfile

- [ ] 1.1 Create `docker/Dockerfile` with `base` stage: `node:22-bookworm-slim`, install system packages (tmux, jq, git, curl, ripgrep, fd-find, build-essential, python3)
- [ ] 1.2 Add code-server binary install to `base` stage (pinned version via `ARG`, install.sh script)
- [ ] 1.3 Add zrok binary install to `base` stage (pinned version via `ARG`)
- [ ] 1.4 Create `app` stage: non-root `pi` user (UID 1000), install `@mariozechner/pi-coding-agent` globally
- [ ] 1.5 Copy dashboard source, run `npm install` + `npm run build`, remove build-essential and python3
- [ ] 1.6 Set `EXPOSE 8000 9999`, define `VOLUME` declarations, set default `CMD`

## 2. Entrypoint and Auth Seeding

- [ ] 2.1 Create `docker/scripts/seed-auth.js`: read `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` env vars, write `auth.json` with `0600` permissions, skip if file exists
- [ ] 2.2 Create `docker/entrypoint.sh`: run seed-auth.js, start tmux server, exec `pi-dashboard` with env-driven port flags
- [ ] 2.3 Add `entrypoint.sh` to Dockerfile (`COPY`, `chmod +x`, `ENTRYPOINT`)

## 3. Docker Compose Base

- [ ] 3.1 Create `docker/compose.yml`: single `pi-dashboard` service with build context, `init: true`, env-driven port mappings
- [ ] 3.2 Add named volumes (`pi-state`, `zrok-state`), tmpfs on `/tmp`, volume mount targets in service
- [ ] 3.3 Add healthcheck (`curl -f http://localhost:8000/api/health`), resource limits (memory), restart policy
- [ ] 3.4 Add environment variables section with defaults for `DASHBOARD_PORT`, `PI_GATEWAY_PORT`, `PI_GATEWAY_BIND`, `PI_SPAWN_STRATEGY`, `TUNNEL_ENABLED`

## 4. Volume Performance Profiles

- [ ] 4.1 Add commented volume configurations in `compose.yml` for default, performance (ext4 `noatime,data=writeback,barrier=0,commit=60`), and ephemeral (tmpfs `size=2g`) profiles
- [ ] 4.2 Document each profile's use case and trade-offs as inline comments

## 5. Workspace and Override Files

- [ ] 5.1 Create `docker/compose.override.yml.example` with example workspace bind mounts, read-only mount example, and instructions
- [ ] 5.2 Create `docker/compose.dev.yml`: bind-mount source, anonymous volume for `node_modules`, expose Vite HMR port 5173, `NODE_ENV=development`

## 6. Environment Configuration

- [ ] 6.1 Create `docker/.env.example` with all knobs: API keys, ports, gateway bind, zrok token, tunnel flag, spawn strategy, resource limits — each with explanatory comments
- [ ] 6.2 Add `docker/.gitignore` to exclude `.env` and `compose.override.yml` (user-specific files)

## 7. Electron Remote Mode

- [ ] 7.1 Extend `ModeConfig` type in `packages/electron/src/lib/wizard-state.ts`: add `"remote"` to mode union, add optional `remoteUrl` field, update `readModeFile()` and `writeModeFile()` to handle the new mode
- [ ] 7.2 Modify `ensureServer()` in `packages/electron/src/lib/server-lifecycle.ts`: when mode is `"remote"`, return `remoteUrl` directly (skip mDNS, health check, spawn)
- [ ] 7.3 Add "Remote" radio option to wizard renderer with URL input field and "Test Connection" button (calls `GET <url>/api/health`)
- [ ] 7.4 Test: wizard saves remote mode to `mode.json`, `ensureServer()` returns URL, `didWeStartServer()` returns false, quit sends no shutdown request

## 8. Documentation

- [ ] 8.1 Create `docker/README.md` with quick-start guide, volume profiles explanation, workspace setup, dev mode, external gateway configuration, Electron remote-mode connection
- [ ] 8.2 Update project `AGENTS.md` with Docker section (key files, build/run commands)
- [ ] 8.3 Update project `README.md` with Docker deployment section
