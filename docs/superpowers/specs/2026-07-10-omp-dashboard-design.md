# OMP Dashboard Design

## Status

Approved design.

## Goal

Ship web-only dashboard for OMP `16.4.1` sessions.

Keep OMP terminal workflow authoritative.

Show and control supported OMP session state from browser.

Exclude Electron.

## Scope

Target runtime: OMP `16.4.1`.

Target package: `@zgeenergy/omp-dashboard`.

Target host: Node `22`.

Target network: loopback only.

Target client: browser.

OMP plugin manager installs and links package.

Package declares bridge through `omp.extensions`.

Package never modifies Pi settings.

Package never modifies OMP settings to register bridge.

## Distribution

Publish one root package: `@zgeenergy/omp-dashboard`.

Ship self-contained runtime files.

Ship bridge at `dist/extension/index.mjs`.

Ship server CLI at `dist/server/cli.mjs`.

Ship browser assets at `dist/web/**`.

Resolve every runtime import from package contents or Node `22` built-ins.

Ship no runtime dependency on `@blackbelt-technology/*`.

Import no `@blackbelt-technology/*` runtime module.

Treat OMP plugin manager as sole install and link owner.

Do not add dashboard package-manager behavior.

Do not add package recommendations.

Do not write package paths into Pi or OMP settings.

## Compatibility Boundary

Keep Pi-era imports only inside OMP-loaded bridge.

Use Pi-era imports only where documented OMP loader compatibility supplies them.

Do not import arbitrary `@blackbelt-technology/*` modules through compatibility.

Keep server, browser, and shared runtime free of Pi-era imports.

Fail bridge load clearly when required documented OMP compatibility surface disappears.

## Runtime Topology

```text
OMP 16.4.1 interactive session
  -> dist/extension/index.mjs
  -> loopback WebSocket
  -> dist/server/cli.mjs
  -> loopback WebSocket
  -> dist/web/** browser client

server-owned headless-session keeper
  -> protocol JSONL stdio
  -> its `omp --mode rpc` child
```

Bridge reads OMP session manager and OMP session artifacts.
Bridge sends session events and interactive controls through loopback WebSocket.

Bridge launches or attaches server through package-local `dist/server/cli.mjs`.

Server runs under Node `22`.

Server binds only `127.0.0.1` and/or `::1`.

Server never binds wildcard, LAN, or public interfaces.
Server serves static browser assets through loopback HTTP.

Browser loads static files from `dist/web/**`.

Browser sends dashboard requests through loopback WebSocket.

Browser never calls provider APIs.

Browser never parses OMP files directly.

Bridge owns interactive OMP API calls.
Server-owned headless-session keeper owns OMP RPC child calls.

Server owns session projection, RPC routing, preference storage, and file-read policy.

## Transport Contracts

Bridge and server exchange session messages through loopback WebSocket.

Browser and server exchange dashboard messages through loopback WebSocket.

Browser loads static assets through loopback HTTP.

Server-owned headless-session keeper starts its `omp --mode rpc` child.

Keeper writes one JSONL RPC request per OMP child `stdin` line.

Keeper reads one JSONL RPC response or event per OMP child `stdout` line.

Only OMP RPC child `stdout` carries JSONL RPC.

OMP RPC child `stderr` carries diagnostics.
Bridge code loaded inside OMP RPC child never calls `console.log`.

`console.log` writes protocol `stdout`; diagnostics use `stderr` or logger.


Server returns structured errors through WebSocket.

Server preserves request correlation IDs.

## Active Agent Directory

Resolve active `agentDir` in this order.

Explicit agent-dir wins.

Active OMP profile agent directory follows.

Fallback path: `~/.omp/agent`.

Store OMP sessions under `<agentDir>/sessions`.

Store dashboard data under `<agentDir>/dashboard`.

Store dashboard preferences under `<agentDir>/dashboard/preferences.json`.

Keep dashboard data inside resolved `agentDir`.

Never infer agent data from legacy `~/.pi` paths.

## Session Identity and State

Use OMP session manager identity as canonical `sessionId`.

Use OMP session header identity when loading persisted session state.

Do not generate dashboard-only session IDs.

Do not merge distinct OMP session IDs.

Key every session record by canonical `sessionId`.

Keep per-session sequence numbers monotonic.

Keep per-session ordering independent from other sessions.

Track session phases: `registering`, `replaying`, `live`, `disconnected`, `complete`.

`register` creates or refreshes session metadata before transcript traffic.

`replay` reads persisted OMP JSONL in source order.

Bridge buffers live events during replay.

Bridge sends buffered live events after replay tail.

Bridge sends `complete` after replay and buffered events drain.

Server commits event before publishing event to browser.

Reconnect supplies last acknowledged per-session sequence.

Server replays missing events in ascending sequence order.

Reconnect never duplicates acknowledged events.

Reconnect never interleaves replay and later live events.
Browser reconnect restores dashboard transport only.

Browser reconnect never invokes OMP session resume.

Completion marks replay boundary.

Completion does not permit session identity replacement.

## OMP JSONL Projection

Treat OMP JSONL as source-of-truth session record.

Preserve JSONL record order.

Preserve optional fixed-width non-JSON title slot before JSONL header.

Preserve JSONL header `title` and `titleSource`.

Expose title slot separately from header title fields.

Preserve OMP `model_change.model` string exactly.

Preserve optional `model_change.role` exactly.

Do not derive model from provider catalogue data.

Resolve external blob references before replay.

Preserve blob references and resolved blob payload semantics.

Preserve user, assistant, and tool ID-parent chains.


Do not synthesize title from project path, prompt text, or browser state.

Do not translate blobs through Pi-specific formats.

Fixture projections must match OMP JSONL semantic fields and order.

## Browser Functions

Show registered sessions.

Show replayed and live transcript state.

Show OMP title slots, header titles, model string, and blobs.

Send prompt to selected OMP session.

Abort selected OMP session.

Dispatch supported slash command only for dashboard-owned headless session with live OMP RPC keeper.
Return explicit `unavailable` status for interactive TUI slash command.

Show scoped read-only file content.

Read and update dashboard preferences.

## Control Rules

Prompt RPC targets one canonical `sessionId`.
Browser sends control through server WebSocket.

Server routes interactive prompt and abort through bridge WebSocket.

Server routes headless slash command only through live OMP RPC keeper.

Bridge submits interactive prompt through OMP session manager.

Abort RPC targets one canonical `sessionId`.

Bridge aborts only target interactive OMP session.

Slash-command RPC carries command identity and structured arguments.

Server accepts slash command only for dashboard-owned headless session with live OMP RPC keeper.
Interactive TUI slash-command request returns explicit `unavailable` status.
Headless-session keeper dispatches headless slash command through OMP RPC.

Browser never encodes slash command as plain prompt text.

Slash commands never travel through prompt path.

Control request validates selected session before OMP dispatch.

Rejected control request returns structured error.

No control request crosses session boundary.

## Session-Owned Process Control

Process-control RPC accepts dashboard-owned process handle only.

Process registry records owner `sessionId` before control becomes available.

Controller session must equal recorded owner `sessionId`.

Server rejects raw PID input.

Server rejects handles from another session.

Server rejects unknown handles.

Server never controls terminal, OMP, or system process without registered ownership.

## Read-Only File Viewing

File-view RPC requires canonical `sessionId` and requested path.

Server resolves requested path against session-scoped read root.

Server canonicalizes every path before access.

Resolved path must remain inside session-scoped read root.

Server rejects `..` escape.

Server rejects absolute-path escape.

Server rejects symlink escape after canonical resolution.

Server returns file bytes or decoded display data only.

Server exposes no file write RPC.

Server exposes no delete, rename, chmod, or `mkdir` RPC.

Server exposes no unrestricted directory browse RPC.

## Preferences

Dashboard preferences belong to dashboard data only.

Preferences never alter OMP provider, authentication, model, catalogue, extension, or profile settings.

Preference update writes only `<agentDir>/dashboard/preferences.json`.

Preference update preserves unrelated dashboard preference keys.

Preference update never writes Pi or OMP settings.

## Security Boundaries

OMP process remains authority for session identity, prompts, aborts, and dashboard-owned headless slash commands.

Bridge remains sole OMP compatibility boundary.

Loopback server limits dashboard exposure to local host.

No mDNS discovery expands server reach.

No tunnel expands server reach.

No pairing flow expands server reach.

Browser receives only session data server authorizes for selected session.

Session ID scopes all control and file-read requests.

Process handle scopes process control.

Canonical path containment scopes file viewing.

OMP RPC child `stdout` remains machine-readable JSONL under all success and error paths.

## Explicit Exclusions

No Electron app.

No provider configuration.

No provider authentication.

No provider catalogue.

No model proxy.

No dashboard package manager.

No dashboard recommendations.

No mDNS.

No tunnel.

No pairing.

No OpenSpec surface.

No worktree surface.

No goal surface.

No automation surface.

No flow surface.

No role surface.

No injected UI surface.

No file write.

No file delete.

No file rename.

No `mkdir`.

No OMP session fork.

No OMP session resume.

## Invariants

OMP `16.4.1` owns extension lifecycle.

`omp.extensions` registers package bridge.

OMP plugin manager owns install and link lifecycle.

Package stays self-contained after install or link.

Runtime dependency graph excludes `@blackbelt-technology/*`.

Bridge-only Pi imports use documented OMP loader compatibility.
Bridge-server messages use loopback WebSocket.

Browser-server messages use loopback WebSocket.

Protocol JSONL stdio exists only between server-owned keeper and its OMP RPC child.

Session identity originates from OMP session manager or persisted OMP header.

Every replay preserves OMP JSONL source order.

Every reconnect preserves per-session event order.

Every control action stays within selected session.

Every process action stays within owning session.

Every file read stays within resolved read root.

Every OMP RPC child `stdout` line parses as one JSON value.
Bridge code loaded inside OMP RPC child never writes diagnostics to `stdout`.

Server never changes Pi or OMP registration settings.

Server never exposes non-loopback listener.

## Acceptance Scenarios

### Package Scan

Pack release artifact for `@zgeenergy/omp-dashboard`.

Inspect artifact file list.

Artifact contains `dist/extension/index.mjs`.

Artifact contains `dist/server/cli.mjs`.

Artifact contains `dist/web/**`.

Artifact contains required runtime dependencies or bundled equivalents.

Artifact contains no runtime import or dependency on `@blackbelt-technology/*`.

Artifact declares `omp.extensions`.

### OMP Install and Link Release Smoke

Install release package through OMP plugin manager.

Link local release candidate through OMP plugin manager.

Start OMP `16.4.1` session for each path.

OMP loader resolves `dist/extension/index.mjs`.

Bridge starts package-local Node `22` server path.

Browser receives registered OMP session.

Install and link create no Pi or OMP settings registration change.

Release path requires no Electron artifact.

### Replay Order and Reconnect

Prepare session JSONL with ordered transcript records.

Start bridge after persisted session exists.

Observe `register` before replay records.

Observe replay records in JSONL source order.

Emit live record during replay.

Observe live record after replay tail.

Observe `complete` after ordered drain.

Disconnect browser after acknowledged sequence `N`.

Reconnect browser with `N`.

Observe only records after `N`.

Observe ascending sequence order without duplicate or interleaved record.

### OMP Session Fixture Parity

Load OMP `16.4.1` session fixture.

Compare projected fixed-width title slot with fixture slot.

Compare projected header `title` and `titleSource` with fixture header.

Compare projected `model_change.model` and optional role with fixture record.

Compare resolved blobs with fixture blob records.

Compare user, assistant, and tool ID-parent chains with fixture entries.

Compare worker replay, in-process replay, and browser reducer projections.

Compare projected record order with fixture JSONL order.

### Control and Session Isolation

Register sessions `A` and `B`.

Prompt `A`.

Observe OMP prompt only in `A`.

Abort `B`.

Observe OMP abort only in `B`.

Attempt slash command for interactive `A`.
Observe explicit `unavailable` status and no OMP command dispatch.
Start dashboard-owned headless session `C` with live OMP RPC keeper.
Dispatch slash command for `C`.
Observe OMP RPC command dispatch only in `C`.

Send slash-command-shaped prompt text.

Observe prompt path remains prompt path.

Attempt `A` control against `B` process handle.

Observe structured ownership rejection.

### JSONL-Safe OMP RPC Child `stdout`

Start headless-session keeper.

Start OMP `--mode rpc` child.

Send successful keeper request.

Parse every OMP RPC child `stdout` line as JSON.

Send malformed OMP RPC request.

Parse every emitted OMP RPC child `stdout` line as JSON.

Trigger handled keeper error.

Parse every emitted OMP RPC child `stdout` line as JSON.

Observe OMP RPC child diagnostics on `stderr`.

### File Containment

Request in-root session file.

Observe read-only content response.

Request `../` escape.

Observe rejection.

Request absolute outside-root path.

Observe rejection.

Request symlink resolving outside root.

Observe rejection.

Attempt write or `mkdir` operation.

Observe unsupported-operation rejection.

## Primary Sources

Public dashboard upstream: <https://github.com/BlackBeltTechnology/pi-agent-dashboard>.

Assessed OMP dashboard fork: <https://github.com/oldschoola/omp-agent-dashboard>.

OMP host: <https://github.com/can1357/oh-my-pi>.

OMP `v16.4.1` release: <https://github.com/can1357/oh-my-pi/releases/tag/v16.4.1>.

OMP official documentation: <https://omp.sh/docs/>.

OMP `v16.4.1` documentation source: <https://github.com/can1357/oh-my-pi/tree/v16.4.1/docs>.
