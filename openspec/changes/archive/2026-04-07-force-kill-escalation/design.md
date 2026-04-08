## Context

The dashboard's Stop button sends a soft `abort` message through the bridge to `ctx.abort()`, which fires the AbortSignal on the current tool. If the tool doesn't respect the signal (or the process is truly hung), the user has no way to kill it from the dashboard without using the Shutdown action in the kebab menu — which removes the session entirely.

Current kill chain:
- **Abort**: `browser → server → bridge → ctx.abort()` — cancels the turn, session stays alive
- **Shutdown**: `browser → server → bridge → ctx.shutdown() + process.exit(500ms)` + `headlessPidRegistry.killBySessionId()` — session is removed from sidebar

There's no middle ground: "kill the process but keep the session around for resume/fork."

### Key existing structures
- `DashboardSession` in `types.ts` — no `pid` field currently
- `SessionRegisterMessage` in `protocol.ts` — no `pid` field currently
- `CommandInput.tsx` — renders the Stop button when `sessionStatus === "streaming"`
- `session-action-handler.ts` — handles `abort` and `shutdown` messages
- `headless-pid-registry.ts` — tracks PIDs for dashboard-spawned headless sessions only
- `memory-session-manager.ts` — in-memory session CRUD

## Goals / Non-Goals

**Goals:**
- Two-click escalation: soft abort → force kill process
- Session preserved as "ended" after force kill (resumable/forkable)
- Works for all session sources (headless, tmux, terminal, tui)
- Clear visual feedback at each escalation stage
- Minimal protocol/type surface area

**Non-Goals:**
- Per-tool cancellation (requires pi SDK changes)
- Flow/subagent force kill (separate mechanism)
- Auto-escalation on timeout (user must click)
- Windows support for process group killing (existing limitation)

## Decisions

### 1. PID tracking via session register message

**Decision**: Add `pid` field to `SessionRegisterMessage` and store it on `DashboardSession`.

**Why**: The bridge knows its own `process.pid`. Sending it at registration is the simplest, most reliable approach. The server stores it alongside other session metadata.

**Alternatives considered**:
- *Heartbeat-only PID*: More complex, PID already known at startup, no benefit to deferring
- *Server-side PID discovery via `ps` grep*: Fragile, race-prone, already partially exists in `killHeadlessBySessionId` as a fallback

### 2. Reuse `shutdown` handler with a "soft" flag instead of new message type

**Decision**: Add a new `force_kill` message type in `browser-protocol.ts` rather than overloading `shutdown`.

**Why**: Shutdown has specific semantics (session removed from sidebar, bridge graceful exit). Force kill has different semantics (session marked ended, process killed, session stays visible). Mixing them creates confusing conditionals. A separate message type is clearer.

### 3. SIGTERM → delay → SIGKILL escalation on server

**Decision**: Server sends SIGTERM first, waits 2 seconds, checks if process is still alive, then sends SIGKILL if needed.

**Why**: SIGTERM gives the process a chance to clean up (save session state, flush buffers). SIGKILL is the last resort. The 2-second window is short enough to feel responsive but long enough for graceful cleanup.

**Implementation**: Use `process.kill(pid, 'SIGTERM')`, then `setTimeout` + `process.kill(pid, 0)` to check liveness, then `process.kill(pid, 'SIGKILL')` if still alive.

### 4. Button state machine lives in CommandInput

**Decision**: The escalation state (`idle` | `aborting` | `killing`) is local state in `CommandInput.tsx`, driven by props (`sessionStatus`) and user clicks.

**Why**: This is pure UI state — no other component needs it. Keeping it local avoids polluting the global session state. The state resets naturally when `sessionStatus` changes away from `streaming`.

### 5. Mark session "ended" not "removed" after force kill

**Decision**: After force-killing, update session status to `ended` via `session_updated` broadcast. Do NOT unregister/remove the session.

**Why**: The user's conversation history is preserved. They can resume or fork the session. This is the key differentiation from `shutdown`.

### 6. PID safety check before SIGKILL

**Decision**: Before sending SIGKILL, verify the PID still belongs to a pi-related process by checking `/proc/<pid>/cmdline` (Linux) or `ps -p <pid> -o command=` (macOS).

**Why**: Mitigates PID reuse risk. If the PID now belongs to a different process, skip the kill and report the session as already dead.

## Risks / Trade-offs

- **[PID reuse]** → Mitigated by command-line verification before SIGKILL and the short time window between register and kill.
- **[Bridge WebSocket still open after kill]** → Server force-closes the bridge WS connection for the session after sending SIGTERM. The pi-gateway already handles disconnection cleanup.
- **[Session state not saved on SIGKILL]** → SIGKILL doesn't allow cleanup. However, pi auto-saves session state periodically, so at most the last few seconds of conversation are lost. SIGTERM (first step) gives 2s for a graceful save.
- **[User clicks Force Kill accidentally]** → The two-click requirement with visual state change (red → orange pulsing) provides enough friction. No confirmation dialog needed — the user is already in a "something is stuck" mindset.
