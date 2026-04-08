# Force Kill Escalation

## Problem

Two related pain points when tool calls get stuck or noisy:

1. **No way to stop stuck tools**: When a tool call gets stuck (hanging bash command, frozen network request, unresponsive browser automation), the only option is the Stop button which sends a soft `abort`. If the process ignores the abort signal — or the tool doesn't respect it — the user has no recourse from the dashboard. They must manually find and kill the process, or use the Shutdown action buried in the kebab menu (which removes the session entirely).

2. **Repetitive tool calls flood the chat**: Retry loops (e.g. health check polling after server restart) produce dozens of near-identical tool call blocks that clutter the chat view and push real content out of sight.

## Solution

Two-level escalation available in **two locations**:

### 1. CommandInput Stop Button (existing + enhanced)
1. **Click 1 — Soft Abort** (existing behavior): Sends `abort` to the bridge, which calls `ctx.abort()`. The button transitions to a "Force Stop" state with a visual countdown/pulse.
2. **Click 2 — Force Kill** (new): Sends a new `force_kill` message. The server terminates the pi process via SIGTERM → wait 2s → SIGKILL. The session is marked as "ended" (not removed), so it can be resumed or forked later.

### 2. Inline Stop Button on Running Tool Cards (new)
When a tool call is actively running, a small stop button appears on the tool call header row in `ToolCallStep`. This gives contextual, immediate access to abort right where the user sees the stuck command. Clicking it sends the same `abort` message. If abort doesn't work and the tool is still running, the button escalates to force-kill (same two-click pattern as CommandInput).

### 3. Collapse Repeated Tool Calls (new)
When consecutive tool calls have the same tool name and similar arguments (e.g. repeated `bash` calls with `curl ... /api/health`), they are collapsed into a single expandable group showing the count: "$ sleep 2 && curl ... (×24)". The last result is shown; expanding reveals all calls. This keeps the chat clean during retry loops.

## Scope

### In Scope
- Stop button state machine: normal → aborting → force-killable
- Inline stop button on running tool cards in `ToolCallStep`
- Collapse consecutive repeated tool calls in ChatView
- New `force_kill` browser→server message type
- Server-side process killing (PID-based)
- Bridge sends `process.pid` in session register message
- Server stores PID per session
- Visual feedback: button color/label/animation transitions
- Works for both headless and tmux-spawned sessions

### Out of Scope
- Per-tool cancellation (would require pi SDK changes)
- Flow/subagent force kill (flows have their own abort mechanism)
- Automatic timeout-based escalation (user must click)

## UX Flow

```
State: STREAMING
┌──────────────────┐
│  🟥 [■ Stop]      │  ← Click 1: sends "abort"
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
 Session   Still streaming
 stops ✓   (abort ignored)
              │
State: ABORTING (button appears immediately)
┌────────────────────────┐
│  🟧 [⚠ Force Stop]     │  ← Click 2: sends "force_kill"
│  (pulsing animation)   │
└────────┬───────────────┘
         │
         ▼
State: KILLING
┌────────────────────────┐
│  🟧 [⏳ Killing...]     │  ← Non-interactive, brief
└────────┬───────────────┘
         │
         ▼
 SIGTERM → 2s → SIGKILL
 Session marked "ended"
 Resumable via fork/continue
```

## Technical Approach

### Bridge Change
- Include `process.pid` in the `session_register` message so the server knows which OS process to kill.

### Protocol Change
- New `force_kill` message in `browser-protocol.ts` (browser → server).
- New `force_kill_result` response message (server → browser).

### Server Change
- Store PID from `session_register` in the session manager.
- New handler in `session-action-handler.ts`: receive `force_kill`, send SIGTERM to process, wait 2s, send SIGKILL if still alive, mark session as "ended", broadcast update.
- Force-close the bridge WebSocket connection for that session.

### Client Change
- Stop button in `CommandInput.tsx` gains a state machine:
  - `idle` → show Stop button when streaming
  - `aborting` → after first click, show "Force Stop" (orange, pulsing)
  - `killing` → after second click, show "Killing..." (brief, non-interactive)
- State resets when session status changes away from "streaming".
- The "Force Stop" button appears immediately after first click (no artificial delay) — the abort may work quickly, in which case the button simply disappears as the session stops streaming.
- `ToolCallStep.tsx` shows a small stop (✖) button on the tool call header row when `status === "running"`. Clicking sends `abort`; second click escalates to `force_kill`. Uses the same two-click state machine as CommandInput. Button disappears when the tool completes or errors.
- `ChatView.tsx` groups consecutive `toolResult` messages with the same `toolName` and similar `args` into a collapsed group. The group shows the count and last result. Expanding reveals all individual calls. Similarity is based on the tool name and a normalized version of the args (e.g. ignoring whitespace differences).

## Risks

- **PID reuse**: Between sending PID and force-killing, the PID could theoretically be reused by another process. Mitigated by the short time window and by verifying the process command line before SIGKILL.
- **Tmux sessions**: For tmux sessions not spawned by the dashboard, the PID from `process.pid` is the pi process inside the pane, which should be killable. The tmux pane will show the process as terminated.
- **Externally attached sessions**: Sessions started manually in a terminal will have their process killed. The terminal will show the exit. This is expected — the user asked for a force kill.
