## MODIFIED Requirements

### Requirement: Workspace add via existing pending-attach lever

The dashboard SHALL expose a `POST /api/jj/workspace/add` endpoint accepting `{ fromCwd: string, name: string, sessionId: string, taskDescription?: string }`.

The endpoint SHALL accept an optional `baseRev?: string` field naming the revision the new workspace's working copy commits onto. When omitted, the server SHALL resolve the current bookmark of `fromCwd` (via `jj log -r @ -T 'bookmarks'`) and use that; when no bookmark is present, the server SHALL fall back to the result of the revset `trunk()`.

The endpoint SHALL:

1. Validate `name` matches `/^[a-z0-9-]+$/`.
2. Validate `sessionId` corresponds to a live (non-ended) pi session whose `cwd` is inside `fromCwd`'s repo. Reject with HTTP 400 (`code: "INVALID_SESSION"`) if not.
3. Reject with HTTP 409 (`code: "SESSION_BUSY"`) if the named session has an in-flight tool call. The client SHALL surface a "wait for current operation to finish" message; no auto-abort.
4. Compute the destination path as `<fromCwd>/<configuredWorkspaceRoot>/<name>` (default `<fromCwd>/.shadow/<name>`).
5. Reject with HTTP 409 (`code: "WORKSPACE_EXISTS"`) if the destination path already exists.
6. Resolve `baseRev` per the rule above.
7. Run `jj workspace add <destPath> -r <baseRev>` via `platform/jj.ts`.
8. Resolve the destination with `safeRealpathSync`.
9. Resolve the source session's `sessionFile` (JSONL path); reject with HTTP 409 (`code: "NO_SESSION_FILE"`) if absent (mirrors the `handleHeadlessReload` guard — a session without a sessionFile cannot be re-hydrated).
10. Call `headlessPidRegistry.killBySessionId(sessionId)` to SIGTERM the source process. The call SHALL be idempotent (no error if the PID is already dead).
11. Call `spawnPiSession(realDestPath, { sessionFile, mode: "continue", strategy: <configured spawnStrategy> })`. Re-hydration of `tokens`, `cost`, `contextUsage`, and `attachedProposal` is provided by `memorySessionManager.register` (same guarantee `headless-reload-via-respawn` depends on); the plugin SHALL NOT re-implement state preservation.
12. Return HTTP 202 with `{ sessionId, workspacePath }`. The `sessionId` SHALL be unchanged from the request — same id, same JSONL, new cwd.

The respawned session SHALL preserve its existing JSONL conversation history. The `Session.cwd` field SHALL update to the workspace path on the next `session_updated` broadcast. The same session id SHALL be reused.

Creating a workspace SHALL NOT alter the source workspace's working copy, index, bookmarks, or any other observable state. The plugin SHALL NOT require any other session to pause or quiesce before workspace creation, except the session being respawned (per step 3 + 9).

#### Scenario: Successful workspace add and respawn

- **GIVEN** a colocated jj repo at `/repo` with live session S1 at cwd `/repo`
- **WHEN** the browser POSTs `{ fromCwd: "/repo", name: "agent-1", sessionId: "S1" }`
- **THEN** `/repo/.shadow/agent-1/` SHALL exist as a registered jj workspace
- **AND** session S1 SHALL be SIGTERMed and respawned with the same JSONL but cwd `/repo/.shadow/agent-1/`
- **AND** the next `session_updated` broadcast for S1 SHALL show `cwd = /repo/.shadow/agent-1/`
- **AND** S1's `Session.jjState.workspaceName` SHALL be `"agent-1"` after the next probe tick
- **AND** S1's conversation history (chat messages, tool calls) SHALL remain visible in the dashboard

#### Scenario: Concurrent workspace creation while another session has uncommitted work

- **GIVEN** session A is in `/repo` on bookmark `develop` with uncommitted edits to `auth.ts`
- **AND** session B is also in `/repo`
- **AND** the repo is jj-colocated
- **WHEN** the browser POSTs `{ fromCwd: "/repo", name: "agent-1", sessionId: "B" }` (respawning B, NOT A)
- **THEN** the workspace add SHALL succeed and respawn B in the new workspace
- **AND** session A SHALL be untouched (still alive at `/repo`)
- **AND** session A's working copy on disk SHALL be unchanged
- **AND** session A's `@` commit SHALL be unchanged
- **AND** the new workspace's working copy SHALL be empty on top of `develop`, NOT inheriting session A's `auth.ts` edits
- **AND** the `develop` bookmark SHALL still point at the same commit as before

#### Scenario: Name validation rejection

- **GIVEN** the browser POSTs `{ fromCwd: "/repo", name: "agent_1", sessionId: "S1" }` (underscore)
- **THEN** the endpoint SHALL respond HTTP 400 with `{ code: "INVALID_NAME", message: "..." }`
- **AND** no filesystem mutation SHALL occur
- **AND** session S1 SHALL be untouched

#### Scenario: Refusal when source session is busy

- **GIVEN** session S1 in `/repo` is currently executing a tool call (`session.status === "streaming"`)
- **WHEN** the browser POSTs `{ fromCwd: "/repo", name: "agent-1", sessionId: "S1" }`
- **THEN** the endpoint SHALL respond HTTP 409 with `{ code: "SESSION_BUSY", message: "..." }`
- **AND** SHALL NOT create the workspace directory
- **AND** SHALL NOT call `headlessPidRegistry.killBySessionId`
- **AND** S1 SHALL continue executing its tool call uninterrupted
- **AND** the busy gate SHALL be the same `session.status === "streaming"` check used by `handleHeadlessReload` (no new busy semantics)

#### Scenario: Refusal when source session has no JSONL file

- **GIVEN** session S1 with `session.sessionFile` undefined (e.g. an ad-hoc session that never registered a file)
- **WHEN** the browser POSTs `{ fromCwd: "/repo", name: "agent-1", sessionId: "S1" }`
- **THEN** the endpoint SHALL respond HTTP 409 with `{ code: "NO_SESSION_FILE", message: "Session has no JSONL file — cannot respawn into workspace" }`
- **AND** S1 SHALL be untouched

### Requirement: Fold-back skill is jj-native and never invokes mutating git

The skill `.pi/skills/jj-workspace-fold-back/SKILL.md` SHALL be a single-paragraph documentation pointer directing agents to invoke `POST /api/jj/workspace/fold-back` with the workspace name and cwd. The endpoint owns the executable flow; the skill body owns the agent-readable instruction.

The skill SHALL list, verbatim, the canonical refusal codes returned by the endpoint (`NOT_COLOCATED`, `CONFLICTS_PRESENT`, `EMPTY_WORKING_COPY`, `DIRTY_INDEX`, `BOOKMARK_EXISTS`, `REBASE_CONFLICT`, `PUSH_FAILED`, `TRUNK_PUSH_BLOCKED`) so agents handling errors know what to expect.

The legacy bash flow SHALL be preserved verbatim under `.pi/skills/jj-workspace-fold-back/legacy-bash/fold-back.sh` as a fallback for environments without the dashboard. The skill body SHALL reference this fallback explicitly.

The skill SHALL NOT contain executable bash that an agent is expected to copy-and-run; that path was Decision 5 of `add-jj-workspace-plugin` and is reversed by `jj-plugin-server-driven-flows`.

The endpoint behind the skill SHALL preserve all original safety guarantees: refusal on conflicts, refusal on empty WC, refusal on dirty index, refusal on bookmark conflict, full rollback via `jj op restore` on rebase conflict, and never invoking mutating git commands. Those guarantees move from the skill bash into the endpoint's TS implementation, and are exercised by the `jj-fold-back-server` capability's scenarios.

#### Scenario: Skill points at endpoint, not at executable bash

- **GIVEN** an agent reads `.pi/skills/jj-workspace-fold-back/SKILL.md`
- **THEN** the file SHALL state that the canonical path is `POST /api/jj/workspace/fold-back`
- **AND** SHALL list the endpoint's required arguments (`workspaceName`, `cwd`)
- **AND** SHALL list the endpoint's refusal codes verbatim
- **AND** SHALL NOT contain the bash sequence (preflight checks, `jj bookmark create`, `jj rebase`, `jj git push`) in its body
- **AND** SHALL reference `legacy-bash/fold-back.sh` as a documented fallback for non-dashboard environments

#### Scenario: Endpoint preserves original safety guarantees

- **GIVEN** the same fold-back operation that the legacy skill bash performed
- **WHEN** invoked through the endpoint
- **THEN** all four preflight refusals (`NOT_COLOCATED`, `CONFLICTS_PRESENT`, `EMPTY_WORKING_COPY`, `DIRTY_INDEX`) SHALL still apply
- **AND** rebase conflict SHALL still trigger `jj op restore` rollback
- **AND** no `git commit`, `git rebase`, `git merge`, `git stash`, or `git checkout` of tracked files SHALL execute

## ADDED Requirements

### Requirement: Plugin dialogs flow through PromptBus

The plugin SHALL register the following prompt-types in the dashboard's `prompt-component-registry`:

| Prompt type | Purpose |
|---|---|
| `jj-workspace-create` | Dialog rendered for `+ Workspace`: collects workspace name, validates, submits `POST /api/jj/workspace/add` |
| `jj-fold-back` | Dialog rendered for `Fold back`: confirms intent, submits `POST /api/jj/workspace/fold-back`, listens for progress events, renders phase status |
| `jj-forget-confirm` | Dialog rendered when `POST /api/jj/workspace/forget` returns `409 UNFOLDED_WORK`: lists the unfolded commits and re-issues with `force: true` on confirmation |

`JjActionBar` SHALL invoke `promptBus.emit(<prompt-type>, <payload>)` for each button instead of using `window.prompt` or local React dialog state. The `dashboard-default-adapter` SHALL render the registered component as a chat dialog.

The standalone components `JjFoldBackDialog` and `JjForgetConfirmDialog` SHALL be removed. The `buildFoldBackPrompt` clipboard helper SHALL be removed. Tests targeting the removed components SHALL be rewritten against the new prompt-types.

The fold-back dialog component SHALL subscribe to `jj:fold-back-progress` WS events filtered by its own `jobId` and SHALL render phase status (`preflight`, `bookmark`, `rebase`, `push`, `done`) inline. Errors carrying structured codes SHALL be rendered with the actionable copy from the spec (e.g. `DIRTY_INDEX` shows the `git reset` / `jj new -m "WIP"` guidance).

#### Scenario: + Workspace opens PromptBus dialog

- **GIVEN** a session card with a live jj session
- **WHEN** the user clicks `+ Workspace`
- **THEN** the action handler SHALL call `promptBus.emit("jj-workspace-create", { sessionId, fromCwd })`
- **AND** SHALL NOT call `window.prompt`
- **AND** the registered dialog component SHALL render as a chat dialog via `dashboard-default-adapter`

#### Scenario: Fold-back dialog renders streamed progress

- **GIVEN** a workspace session with the fold-back dialog open and a job in flight
- **WHEN** the server emits `{ type: "jj:fold-back-progress", jobId: "<this>", phase: "rebase", status: "ok" }`
- **THEN** the dialog SHALL update to show `rebase ✓` while `push` is still pending
- **AND** when the final `done/ok` event arrives, the dialog SHALL show the resulting commit sha and remote branch name with a clickable link if a remote URL is available

#### Scenario: Forget-confirm dialog re-issues with force

- **GIVEN** the user clicks `Forget` on a workspace with unfolded commits
- **AND** the first POST returns `409 UNFOLDED_WORK` with a list of commits
- **WHEN** the action handler emits `jj-forget-confirm` with the commits payload
- **THEN** the dialog SHALL list the commit descriptions
- **AND** on user confirm SHALL re-POST `forget` with `force: true`
- **AND** on cancel SHALL close without further requests

#### Scenario: Removed components no longer mounted

- **GIVEN** the migration is complete
- **WHEN** the plugin's React tree renders
- **THEN** no `<JjFoldBackDialog />` element SHALL appear (component file deleted)
- **AND** no `<JjForgetConfirmDialog />` element SHALL appear (component file deleted)
- **AND** no import of `buildFoldBackPrompt` SHALL exist anywhere in the codebase
