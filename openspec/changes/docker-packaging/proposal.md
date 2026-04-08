## Why

The pi-dashboard is a multi-component system (server, bridge extension, pi agent, code-server, zrok, tmux, terminals) that requires several tools installed and configured on the host. Packaging everything into a Docker image makes deployment reproducible, portable, and self-contained — especially useful for remote servers, team environments, and CI/CD pipelines. Volume mounts allow workspace isolation and filesystem tuning for heavy I/O workloads.

## What Changes

Add a `docker/` directory with a complete containerization setup. No changes to existing application code.

### Files

**`docker/Dockerfile`** — Multi-stage build on `node:22-bookworm-slim`:
- Stage `base`: System tools (tmux, jq, git, curl, ripgrep, fd-find, build-essential), code-server binary, zrok binary
- Stage `app`: Non-root user `pi` (UID 1000), global `@mariozechner/pi-coding-agent`, dashboard `npm install` + `npm run build`, cleanup build-essential
- Runtime: `init: true` (tini via compose), exposes 8000 + 9999, volumes for `/workspaces`, `/home/pi/.pi`, `/home/pi/.zrok2`

**`docker/entrypoint.sh`** — Startup script:
- Seeds `~/.pi/agent/auth.json` from `PI_AUTH_*` env vars on first run only (never overwrites existing)
- Starts tmux server (for tmux spawn strategy)
- Execs `pi-dashboard` with port/flag configuration from env vars

**`docker/scripts/seed-auth.js`** — First-run auth seeder:
- Reads env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.
- Writes `auth.json` with `0600` permissions
- Skips if `auth.json` already exists (volume persisted from previous run)

**`docker/compose.yml`** — Base compose:
- Single service `pi-dashboard` with build context, ports, healthcheck
- Named volumes: `pi-state` (sessions/auth/config), `zrok-state` (tunnel enrollment)
- `tmpfs` on `/tmp` for scratch I/O
- Resource limits (4 GB memory default)
- Environment-driven configuration via `.env`

**`docker/compose.dev.yml`** — Dev overlay (`docker compose -f compose.yml -f compose.dev.yml up`):
- Bind-mounts dashboard source into container for live editing
- Anonymous volume preserves container's `node_modules` (avoids platform mismatch with node-pty native addon)
- Exposes Vite HMR port 5173
- Sets `NODE_ENV=development`, runs `pi-dashboard --dev`

**`docker/compose.override.yml.example`** — Template for workspace mounts:
- Shows how to bind-mount individual project directories to `/workspaces/<name>`
- Includes examples for read-only mounts, multiple projects
- Documents that each mount maps to a pinnable workspace in the dashboard

**`docker/.env.example`** — All configurable knobs:
- API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
- Ports (DASHBOARD_PORT, PI_GATEWAY_PORT)
- External access (PI_GATEWAY_BIND: `0.0.0.0` or `127.0.0.1`)
- Tunnel (ZROK_TOKEN, TUNNEL_ENABLED)
- Spawn strategy (headless/tmux)
- Resource limits

### Volume Performance Profiles

The `compose.yml` includes commented volume configurations for three profiles:

1. **Default** — Named Docker volume, uses host filesystem. Works everywhere, good for moderate usage.
2. **Performance** — Dedicated ext4/xfs partition with `noatime,data=writeback,barrier=0,commit=60`. For many concurrent sessions with heavy JSONL writes. Linux only.
3. **Ephemeral** — tmpfs-backed (`size=2g`). Maximum speed, data lost on restart. For CI/CD and throwaway experiments.

### Pi Gateway External Access

Port 9999 (pi gateway) is exposed by default so external pi sessions can connect. Two layers of control:
- **Compose `ports`**: Remove or empty `PI_GATEWAY_PORT` to stop publishing
- **Server bind address**: `PI_GATEWAY_BIND=127.0.0.1` makes the server reject non-local connections even if the port is published

### API Key Provisioning

Both paths are first-class:
1. **Pre-configured**: Set keys in `.env` file → `entrypoint.sh` seeds `auth.json` on first run → persisted in `pi-state` volume
2. **Browser UI**: Start container without keys → open dashboard → Settings → Provider Auth → OAuth or paste keys → saved to `auth.json` in volume

### Architecture Constraint: Single Container

The dashboard's components are inherently colocated — pi sessions, terminals (node-pty), code-server, and the server all need shared filesystem access and localhost communication. A multi-container split would fight the architecture (tmux can't spawn in another container, code-server needs the workspace filesystem, pi gateway is localhost). One container with multiple processes managed by the dashboard server is the correct design.

### Base Image: Debian, Not Alpine

`node-pty` requires glibc for proper PTY support. Alpine uses musl which causes subtle terminal emulation issues. `node:22-bookworm-slim` provides glibc with minimal image size.

## Capabilities

### New Capabilities

- `docker-packaging`: Complete Docker containerization of the pi-dashboard ecosystem with all tools (pi, code-server, zrok, tmux, jq, git, bash, ripgrep), configurable volumes with I/O performance profiles, dual API key provisioning, and optional external pi gateway access.

### Existing Capabilities Modified

None. This is a purely additive change — a new `docker/` directory. No existing code is modified.
