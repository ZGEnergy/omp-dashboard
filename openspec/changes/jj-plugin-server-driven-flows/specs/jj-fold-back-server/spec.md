## ADDED Requirements

### Requirement: Server-side fold-back endpoint

The dashboard SHALL expose `POST /api/jj/workspace/fold-back` accepting `{ workspaceName: string, cwd: string, mode?: "preserve" }`.

The endpoint SHALL execute the same logical sequence as the legacy `jj-workspace-fold-back` skill, but in TypeScript, with structured error codes and async progress events instead of clipboard-driven agent invocation.

The endpoint SHALL respond synchronously with `{ ok: true, jobId: string }` on accepted requests and stream all subsequent state via WebSocket progress events keyed on `jobId`. The endpoint SHALL respond synchronously with `{ ok: false, code, message, data? }` for any preflight failure that can be detected without mutating jj state.

The `mode` field is reserved for future expansion. The initial endpoint SHALL accept only `mode === "preserve"` (or omitted, treated as `"preserve"`) and SHALL respond `400 INVALID_MODE` for any other value.

#### Scenario: Successful fold-back with preserved history

- **GIVEN** a jj-colocated repo with workspace `agent-1` containing 3 commits not on trunk
- **AND** the workspace has no conflicts and a clean git index
- **WHEN** the browser POSTs `{ workspaceName: "agent-1", cwd: "/repo/.shadow/agent-1" }`
- **THEN** the endpoint SHALL respond `200 { ok: true, jobId: "<uuid>" }`
- **AND** SHALL emit progress events `phase: "preflight"`, `phase: "bookmark"`, `phase: "rebase"`, `phase: "push"`, `phase: "done"` in order, each with `status: "ok"`
- **AND** the final `done` event SHALL include `{ commit: "<git-sha>", remoteBranch: "agent-1", commitsPreserved: 3 }`
- **AND** the remote git branch `agent-1` SHALL contain all 3 original commits (no squash)

#### Scenario: Mode validation

- **GIVEN** a valid workspace
- **WHEN** the browser POSTs with `mode: "squash"`
- **THEN** the endpoint SHALL respond `400 { ok: false, code: "INVALID_MODE", message: "Only mode 'preserve' is supported in this release" }`
- **AND** no jj or git command SHALL execute

### Requirement: Preflight refusal contract

The endpoint SHALL run all four preflight checks before mutating any jj state. Each failure SHALL respond synchronously (no jobId, no progress events) with HTTP 409 and a structured error code:

| Check | Code | Condition |
|---|---|---|
| Repo is jj-colocated | `NOT_COLOCATED` | `<cwd>/.git/` does not exist alongside the jj repo root |
| No unresolved conflicts | `CONFLICTS_PRESENT` | `jj resolve --list` returns non-empty in the workspace |
| Working copy non-empty | `EMPTY_WORKING_COPY` | The revset `trunk()..@` is empty in the workspace |
| Git index clean | `DIRTY_INDEX` | `git diff --cached --quiet` exits non-zero |

The error message for `DIRTY_INDEX` SHALL include the same actionable copy as the legacy skill: `git reset` (no flags) and `jj new -m "WIP"` as the two safe escape hatches, with `git stash` explicitly listed as forbidden.

#### Scenario: Preflight refuses on dirty git index

- **GIVEN** a workspace whose parent repo has staged changes (`git diff --cached` non-empty)
- **WHEN** the browser POSTs to the fold-back endpoint
- **THEN** the endpoint SHALL respond `409 { ok: false, code: "DIRTY_INDEX", message: <copy includes "git reset" AND "jj new -m \"WIP\"" AND "git stash"> }`
- **AND** no `jj` or `git` mutating command SHALL execute
- **AND** no progress events SHALL be emitted

#### Scenario: Preflight refuses on conflicts

- **GIVEN** a workspace where `jj resolve --list` returns at least one file
- **WHEN** the browser POSTs to the fold-back endpoint
- **THEN** the endpoint SHALL respond `409 { ok: false, code: "CONFLICTS_PRESENT", data: { files: [...] }, message: ... }`
- **AND** no jj mutating command SHALL execute

#### Scenario: Preflight refuses on empty working copy

- **GIVEN** a workspace whose tip equals trunk (no unfolded commits)
- **WHEN** the browser POSTs to the fold-back endpoint
- **THEN** the endpoint SHALL respond `409 { ok: false, code: "EMPTY_WORKING_COPY", message: ... }`
- **AND** no jj mutating command SHALL execute

#### Scenario: Preflight refuses on non-colocated repo

- **GIVEN** a jj repo that has no `.git/` (jj-only, not colocated)
- **WHEN** the browser POSTs to the fold-back endpoint
- **THEN** the endpoint SHALL respond `409 { ok: false, code: "NOT_COLOCATED", message: ... }`
- **AND** no command SHALL execute

### Requirement: Bookmark name auto-derivation and conflict refusal

After preflight, the endpoint SHALL attempt to create a bookmark named identically to the workspace at `@`.

If a bookmark with the same name already exists locally pointing at any commit, the endpoint SHALL respond `409 { ok: false, code: "BOOKMARK_EXISTS", data: { existingTarget: "<change-id>" }, message: ... }` BEFORE running rebase. The endpoint SHALL NOT clobber an existing bookmark.

The bookmark name is non-overridable in this initial endpoint (matches the existing skill's Decision 13).

#### Scenario: Bookmark conflict refused before rebase

- **GIVEN** a workspace `agent-1` AND a pre-existing local bookmark `agent-1` pointing at a different commit
- **WHEN** the browser POSTs to the fold-back endpoint
- **THEN** the endpoint SHALL respond `409 { code: "BOOKMARK_EXISTS", ... }`
- **AND** SHALL NOT run `jj bookmark create`, `jj rebase`, or `jj git push`

### Requirement: Rebase rollback on conflict

The endpoint SHALL capture the current `jj op log` head id before invoking `jj rebase`. If the rebase produces conflicts (`jj resolve --list` non-empty post-rebase), the endpoint SHALL:

1. Run `jj op restore <pre-rebase-op-id>` to undo the rebase entirely.
2. Delete the bookmark created in the prior step.
3. Emit a final progress event `{ phase: "rebase", status: "conflict", data: { files: string[] } }`.
4. Mark the job as failed; no further progress events SHALL be emitted for the job.

The workspace SHALL be left in its exact pre-rebase state. The user SHALL be able to investigate or retry from a known starting point.

#### Scenario: Rebase conflict triggers full rollback

- **GIVEN** a workspace where rebase onto trunk would conflict in `src/foo.ts`
- **WHEN** the fold-back endpoint executes the rebase phase
- **THEN** the endpoint SHALL emit `{ phase: "rebase", status: "conflict", data: { files: ["src/foo.ts"] } }`
- **AND** SHALL run `jj op restore <pre-rebase-op-id>`
- **AND** the workspace's `@` SHALL match its pre-rebase state byte-for-byte
- **AND** the bookmark created earlier SHALL no longer exist
- **AND** no `jj git push` SHALL execute

### Requirement: WebSocket progress event contract

Fold-back progress events SHALL be sent over the existing browser WS gateway as messages of type `"jj:fold-back-progress"` with payload `{ jobId: string, phase, status, data? }` where:

- `phase` is one of `"preflight" | "bookmark" | "rebase" | "push" | "done"`.
- `status` is one of `"ok" | "conflict" | "error"`.
- `data` is phase-specific (e.g. `{ files: string[] }` for `rebase/conflict`, `{ commit: string, remoteBranch: string, commitsPreserved: number }` for `done/ok`).

Events SHALL be sent only to the browser session(s) that originated the job (correlation by `jobId`). Events SHALL NOT be persisted to the session JSONL.

If the browser disconnects mid-job, the operation SHALL continue server-side. On reconnect, the client MAY query a future `GET /api/jj/jobs/:jobId` endpoint (not part of this change) to retrieve final state. This release does not provide reconnect-mid-job recovery; clients should keep the dialog open until completion.

#### Scenario: Progress events scoped to originating browser

- **GIVEN** two browser sessions A and B both subscribed to the dashboard
- **AND** session A initiates a fold-back job
- **WHEN** the server emits progress events for that job
- **THEN** session A SHALL receive every event in order
- **AND** session B SHALL receive zero events for that job

#### Scenario: Browser disconnect during job

- **GIVEN** a fold-back job in progress
- **WHEN** the originating browser disconnects after the `bookmark/ok` event
- **THEN** the server SHALL continue executing rebase and push
- **AND** SHALL not emit progress events to other browsers
- **AND** SHALL leave the final state correctly persisted (bookmark created, branch pushed) so a fresh browser load reflects reality

### Requirement: Push uses `jj git push --bookmark` exclusively

The push phase SHALL invoke `jj git push --bookmark <name>` and SHALL NOT invoke any direct git mutation command. The endpoint SHALL forward the jj-resolved binary path from the shared `ToolRegistry` rather than relying on PATH.

When `allowDirectTrunkPush === false` (default per existing plugin config) and the bookmark name is in `["main", "master", "trunk"]`, the endpoint SHALL respond `409 { code: "TRUNK_PUSH_BLOCKED", message: ... }` during preflight, before bookmark creation.

#### Scenario: Push failure surfaces stderr

- **GIVEN** a successful preflight, bookmark, and rebase
- **WHEN** `jj git push` exits non-zero (e.g. remote refused fast-forward)
- **THEN** the endpoint SHALL emit `{ phase: "push", status: "error", data: { stderr: <stderr text> } }`
- **AND** SHALL leave the local bookmark in place (no rollback of the local rebase)
- **AND** the dialog SHALL surface the stderr verbatim so the user can act

#### Scenario: Trunk push blocked by config

- **GIVEN** `allowDirectTrunkPush: false`
- **AND** a workspace named `main` (matching a trunk-like name)
- **WHEN** the browser POSTs to the fold-back endpoint
- **THEN** the endpoint SHALL respond `409 { code: "TRUNK_PUSH_BLOCKED", ... }` during preflight
- **AND** SHALL NOT run any jj mutation

### Requirement: Skill files are documentation pointers, not executable flows

`.pi/skills/jj-workspace-fold-back/SKILL.md` SHALL be rewritten as a single-paragraph instruction directing agents to invoke `POST /api/jj/workspace/fold-back` with the workspace name and cwd. The full bash flow SHALL be preserved verbatim under `.pi/skills/jj-workspace-fold-back/legacy-bash/fold-back.sh` for reference and as a fallback for environments without the dashboard.

`.pi/skills/jj-workspace/SKILL.md` SHALL update its "Shipping work back to trunk" section to point at the endpoint while otherwise remaining unchanged.

#### Scenario: Skill points at endpoint

- **GIVEN** an agent reading `.pi/skills/jj-workspace-fold-back/SKILL.md`
- **THEN** the file SHALL state explicitly that the canonical fold-back path is `POST /api/jj/workspace/fold-back`
- **AND** SHALL list the endpoint's required arguments (`workspaceName`, `cwd`)
- **AND** SHALL NOT contain the executable bash sequence in the SKILL.md body
- **AND** SHALL reference `legacy-bash/fold-back.sh` as a documented fallback
