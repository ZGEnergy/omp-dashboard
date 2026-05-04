## Why

The jj plugin today forces three round-trips through the agent's chat to do simple things: `+ Workspace` opens a `window.prompt` and the existing `POST /api/jj/workspace/add` (in `packages/server/src/routes/jj-routes.ts`) **spawns a brand-new session** instead of respawning the current one — splitting conversation history. `Fold back` only copies a skill-invocation prompt to the clipboard for the agent to paste and run (Decision 5 of `add-jj-workspace-plugin`); dialog state is per-component React state with no way for the server to drive it. Result: clicking a button does not reliably do the thing — it sets up the agent to do the thing. Real users hit this immediately and ask "did it work?". The skill-driven path also has no progress feedback and no typed errors.

The respawn-with-same-JSONL primitive needed to fix the workspace-add UX **already exists and is shipped** — `handleHeadlessReload` in `packages/server/src/browser-handlers/session-action-handler.ts` (change: `headless-reload-via-respawn`) calls `headlessPidRegistry.killBySessionId(sessionId)` followed by `spawnPiSession(cwd, { sessionFile, mode: "continue", strategy: "headless" })` to re-hydrate the same `sessionId` and entry list while `memorySessionManager.register` preserves accumulated state (tokens, cost, context, attachedProposal). The same pattern is reused by `handleSendPrompt` for auto-resume of ended sessions. This change applies that proven primitive to the `+ Workspace` flow with a different `cwd` argument; no new pi-API surface required.

## What Changes

- **BREAKING — Decision 5 reversal:** Fold-back becomes a server endpoint with typed errors and async progress, not a clipboard-paste-and-pray skill invocation. Skill file kept as a thin pointer to the endpoint for headless agents.
- **BREAKING — Workspace-add flow:** `POST /api/jj/workspace/add` (in `packages/server/src/routes/jj-routes.ts`) is changed to **respawn the source session** in the new workspace cwd instead of spawning a fresh session via `pendingAttachRegistry`. The endpoint gains a required `sessionId` field, refuses if the session is non-headless (`headlessPidRegistry.getPid(sessionId) === undefined` → `SESSION_NOT_HEADLESS`) since `killBySessionId` only operates on headless PIDs, performs a streaming-state busy check (matching the existing `handleHeadlessReload` guard), `headlessPidRegistry.killBySessionId(sessionId)` to terminate, then `spawnPiSession(workspacePath, { sessionFile, mode: "continue", strategy: "headless" })` to respawn — same primitive proven by `headless-reload-via-respawn`. Continuous conversation, one session per change. The existing `pendingAttachRegistry.enqueue` call is dropped from this path; the source session's `attachedProposal` is preserved automatically via `memorySessionManager.register` re-hydration.
- **Dialog substrate:** Client-local React dialogs (opened by `JjActionBar` button handlers) subscribe to plugin-namespaced WS events (`jj:fold-back-progress`) for server-pushed multi-phase progress. PromptBus is **not** involved — it routes bridge-originated `ask_user` prompts (extension → server → browser) and has no path for client-originated dialogs or server-pushed updates. The new dialogs replace `JjFoldBackDialog` + `JjForgetConfirmDialog` with versions wired to the WS progress contract; the old components are deleted.
- New REST endpoint `POST /api/jj/workspace/fold-back` added to the existing `packages/server/src/routes/jj-routes.ts` (joining the already-implemented `add`, `forget`, `list`, `init-colocated` routes). The existing `add` route is modified per the BREAKING bullet above; the others are unchanged in this release.
- Fold-back progress streamed as typed events over the existing browser WS gateway (no SSE, no polling, no new transport).
- Pure-TS port of the bash skill's preflight + rollback logic so it is unit-testable and produces structured error codes (`CONFLICTS_PRESENT`, `DIRTY_INDEX`, `EMPTY_WORKING_COPY`, `NOT_COLOCATED`, `REBASE_CONFLICT`, `BOOKMARK_EXISTS`, `PUSH_FAILED`).

## Capabilities

### New Capabilities

- `jj-fold-back-server`: Server-side execution of the fold-back operation as a typed REST endpoint with phased progress events, replacing the clipboard-skill model. Owns preflight refusal contract, jj-op rollback on rebase conflict, and remote-branch creation via `jj git push --bookmark`.

### Modified Capabilities

- `jj-workspace-plugin`: Phase-5 routes are scoped down (no longer spawn new sessions; instead respawn current session). Decision 5 ("fold-back is a skill, not a button") is reversed. Dialog implementations move from per-component React state to PromptBus prompt-types. `JjActionBar` button handlers re-wired to `promptBus.emit(...)` calls instead of inline `window.prompt` + local state.

## Impact

**Code touched:**

- `packages/server/src/routes/jj-routes.ts` — modify existing `add` handler (sessionId + busy-check + respawn instead of new spawn); add new `fold-back` handler
- `packages/server/src/jj/` (new sub-package) — `preflight.ts`, `fold-back.ts`, `workspace-respawn.ts` (helper wrapping `headlessPidRegistry.killBySessionId` + `spawnPiSession({ sessionFile, mode: "continue", ... })`); pure orchestrators with injected jj/git invocations for testability
- `packages/jj-plugin/src/client/JjActionBar.tsx` — replace `window.prompt` and ad-hoc local dialog state with typed dialog open/close state pointing at the new dialog components; delete `JjFoldBackDialog.tsx` and `JjForgetConfirmDialog.tsx` after migration
- `packages/jj-plugin/src/client/dialogs/` — new client-local React dialog components: `JjWorkspaceCreateDialog`, `JjFoldBackProgressDialog`, `JjForgetConfirmDialog` (rewritten); each subscribes to its WS progress channel via `usePluginContext()`
- `packages/jj-plugin/src/shared/` — shared error-codes module and WS event-payload types
- `src/server/browser-gateway.ts` (or per-session forwarder) — forward `jj:fold-back-progress` events scoped to originating browser via existing WS plumbing; no new transport
- `.pi/skills/jj-workspace-fold-back/SKILL.md` — rewrite as a one-paragraph pointer: "agents call `POST /api/jj/workspace/fold-back`"; preserve original bash under `legacy-bash/fold-back.sh`
- `.pi/skills/jj-workspace/SKILL.md` — keep, update fold-back reference to point at the endpoint

**Pi APIs consumed (all already exported and shipping, no pi-side changes):**

- `spawnPiSession(cwd, { sessionFile, mode: "continue", strategy }): Promise<SpawnResult>` from `packages/server/src/process-manager.ts` — the only spawn primitive
- `headlessPidRegistry.killBySessionId(sessionId): void` — SIGTERM-by-PID lookup; idempotent if session already dead
- `memorySessionManager.register(...)` re-hydration semantics that preserve `tokens`, `cost`, `contextUsage`, `attachedProposal` across respawn (per `headless-reload-via-respawn` change)
- `session.status === "streaming"` busy check (same gate `handleHeadlessReload` uses to refuse mid-tool-call respawn)
- `pendingAttachRegistry.enqueue(realDestPath, name)` — only used by the *new-session* spawn path; **not used** by the new respawn path
- `session.sessionFile` (JSONL path) — set by bridge on `session_register`; required for `mode: "continue"` re-hydration

**APIs:**

- New REST: `POST /api/jj/workspace/{add,forget,fold-back}`, `GET /api/jj/workspace/list`, `POST /api/jj/init-colocated`
- New WS event types under `jj-plugin` namespace for fold-back progress (consumed by client-local dialogs)

**No impact on:**

- Other plugins (slot taxonomy unchanged)
- Existing dashboard core (only consumes existing respawn + PromptBus + WS gateway primitives)
- Pi extension protocol (no new message types — only existing respawn flow)
- `process-manager.ts` `SessionOptions`/`SpawnResult` interface — consumed verbatim, not extended
