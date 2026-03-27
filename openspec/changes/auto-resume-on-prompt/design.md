## Context

Currently, `send_prompt` in `browser-gateway.ts` forwards directly to the pi bridge via `piGateway.sendToSession()`. When the session is ended (bridge disconnected), `sendToSession` returns `false` and the prompt is silently lost. The user sees their optimistic prompt card but never gets a response.

The existing `resume_session` flow spawns a new pi process via `spawnPiSession()` (tmux or headless) and the new bridge registers via `session_register` in `server.ts`. The `PendingForkRegistry` already solves a similar "link old → new session" problem by keying on `cwd` with a 30-second expiry.

Key constraint: `pi --session <file>` continues with the same session file but registers with a **new session ID**. The pending prompt must be matched to the new session by `cwd`, not by session ID.

## Goals / Non-Goals

**Goals:**
- Automatically resume an ended session when the user sends a prompt to it
- Queue the prompt and forward it to the resumed session once the bridge connects
- Show visual feedback ("Resuming…" with pulsing dot) on the old session card
- Auto-navigate the browser to the new session and auto-hide the old one
- Handle failures gracefully (no session file, spawn failure, timeout)

**Non-Goals:**
- Fork mode — auto-resume always uses continue mode
- Queuing multiple prompts — last prompt wins if user sends again while resuming
- Resuming from a different client (auto-resume is scoped to the browser that sent the prompt)
- Changing the existing manual resume/fork flow

## Decisions

### 1. Server-side orchestration in `browser-gateway.ts`
**Decision**: Handle auto-resume entirely in the `send_prompt` case of `browser-gateway.ts`, with flush logic in `server.ts` at `session_register` time.

**Rationale**: The server already knows session status and has access to both `sessionManager` and `piGateway`. Client-side orchestration would require coordinating `resume_session` → wait for status change → `send_prompt`, introducing race conditions and spreading logic across client and server.

### 2. `PendingResumeRegistry` keyed by `cwd`
**Decision**: Create a `PendingResumeRegistry` following the `PendingForkRegistry` pattern — a `Map<cwd, PendingResume>` with 30-second expiry timers.

**Rationale**: When `pi --session` spawns, the new session registers with the same `cwd` but a different session ID. Keying by `cwd` works because: (a) only one resume can be in-flight per cwd at a time, and (b) the `PendingForkRegistry` proves this pattern is reliable.

**Alternative considered**: Keying by `sessionFile` and matching on `session_register`'s `sessionFile` field. More precise but adds complexity for no practical benefit — concurrent resumes in the same cwd are not a realistic scenario.

### 3. `resuming` flag on `DashboardSession`
**Decision**: Add an optional `resuming?: boolean` field to `DashboardSession` and broadcast it via `session_updated`.

**Rationale**: The session card's `ActivityIndicator` can check this flag to render "Resuming…" with a pulsing yellow dot. Using an existing `SessionStatus` value (e.g., setting status to "streaming") would be misleading. A separate boolean is clean, doesn't affect other status-dependent logic, and is easy to clear on timeout or success.

### 4. `auto_resume_navigate` browser protocol message
**Decision**: Add a new `AutoResumeNavigateMessage` (`{ type: "auto_resume_navigate", oldSessionId, newSessionId }`) sent from server to browser when the resumed session connects.

**Rationale**: The client needs to know which new session to navigate to and which old session triggered it. This is simpler than overloading `session_updated` or `resume_result` with navigation semantics. The client handles it by calling `navigate(`/session/${newSessionId}`)`.

### 5. Auto-hide old session and auto-navigate
**Decision**: On successful prompt flush, the server hides the old session (`hidden: true`) and broadcasts `auto_resume_navigate`. The client navigates to the new session.

**Rationale**: The old ended session is no longer useful — the user's intent was to continue. Hiding (not deleting) preserves history. Auto-navigation matches the existing spawn pattern (`spawningCwds` in `App.tsx`).

### 6. Prompt forwarding at `session_register` time
**Decision**: In `server.ts`, after processing `session_register`, check `pendingResumeRegistry` for the registering session's `cwd`. If a pending resume exists, send the queued prompt to the new session via `piGateway.sendToSession()`, hide the old session, and broadcast navigation.

**Rationale**: `session_register` is the earliest reliable point where the new bridge is connected and ready to receive messages. The `PendingForkRegistry.consumeFork()` is already called here, so adding pending resume consumption follows the same pattern.

## Risks / Trade-offs

- **[Risk] Multiple ended sessions share the same `cwd`** → The registry stores the specific `oldSessionId` so only the correct old session is hidden. The cwd key is only for matching the incoming `session_register`, which is safe because only one resume can be in-flight per cwd.

- **[Risk] Bridge never connects (spawn failure, crash)** → 30-second timeout clears the pending resume, resets the `resuming` flag on the old session, and broadcasts `session_updated` to restore the card to normal ended state.

- **[Risk] User sends another prompt while resuming** → The registry overwrites the previous entry for the same cwd, so only the latest prompt is forwarded. The old timer is cleared.

- **[Trade-off] Only continue mode, not fork** → Auto-resume always continues. Fork semantics (creating a new branch) require explicit user intent and don't make sense as an automatic action from sending a prompt.
