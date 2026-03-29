## Context

The bridge extension's `session_start` handler auto-starts the dashboard server when it detects the port is closed. The current flow is:

1. `isPortOpen(config.piPort)` → false
2. `launchServer(config)` → spawns detached process, waits 2s for early exit
3. If early exit detected → show warning notification

When multiple agents start concurrently, all pass step 1 before any server is listening. Multiple spawn attempts race; only the first binds the port. The losers see their spawned process exit immediately (port conflict) and show a false warning.

## Goals / Non-Goals

**Goals:**
- Eliminate false "server failed to start" warnings when multiple agents race to launch
- Keep the fix minimal — single retry probe in the failure path

**Non-Goals:**
- File-based locking or coordination between agents
- Changing the server launcher itself
- Preventing redundant spawn attempts (harmless — they just exit)

## Decisions

### Re-probe port after failed launch

After `launchServer` returns `{ success: false }`, call `isPortOpen(config.piPort)` again. If the port is now open, another agent successfully started the server — suppress the warning.

**Rationale:** This is the simplest possible fix. The race window is small (2s launch timeout), so by the time the failure is detected the winning server is already listening. No new dependencies, no coordination protocol, no file locks.

**Alternative considered — file lock:** A lock file (`~/.pi/dashboard/server.lock`) could prevent concurrent launches entirely. Rejected because: adds complexity (lock cleanup on crash, stale lock detection), and the current approach is sufficient — redundant spawns are harmless and exit quickly.

**Alternative considered — longer probe delay:** Waiting longer before the initial probe would reduce races but would slow down the common single-agent case. Rejected.

## Risks / Trade-offs

- **[Tiny timing window]** If the winning server hasn't finished binding by the time the loser re-probes, the warning still fires. → Acceptable: the 2s launch timeout means the server has had time to bind. The ConnectionManager will reconnect regardless.
- **[Extra probe on real failure]** When the server genuinely fails, we do one extra `isPortOpen` call (1s timeout). → Negligible cost, non-blocking path.
