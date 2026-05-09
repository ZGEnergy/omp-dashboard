## Why

Pi 0.74's `ExtensionAPI` still does not expose `dispatchCommand`, `prompt`, or any path to `AgentSession._tryExecuteExtensionCommand`. Typed extension slash commands in the dashboard chat (`/ctx-stats`, `/curator`, `/agents`, `/flows:new`, etc.) cannot be dispatched from inside the bridge extension; the in-flight `fix-extension-slash-commands-in-dashboard` change ships a stopgap that visibly fails with `command_feedback {status:"error", message:"requires pi 0.71+"}`.

This change reopens an architecture that has been **discussed in three prior OpenSpec changes** and was **deferred / rejected each time under assumptions that no longer hold**. The decisive new evidence is that the upstream PR adding `pi.dispatchCommand` (the assumed clean fix, "Path B") has not landed across pi 0.71 → 0.72 → 0.73 → 0.74, and there is no public roadmap commitment.

### Prior decisions and what's changed

| Change | Date | Decision | Why deferred / rejected | What's changed |
|---|---|---|---|---|
| `headless-spawn` | 2026-03-24 | "Direct stdin/stdout RPC pipe from server to headless pi (**future enhancement**)" — Non-Goals section | "This keeps the change minimal — only the spawn mechanism differs ... acceptable for v1" | We are now past v1; the `bridge-only` path has accumulated the gap this enhancement was meant to fill |
| `headless-reload-via-respawn` | 2026-04-21 | "**Option B**: Add `{type:"reload"}` RPC command to `pi --mode rpc`. **The server could then write the command to stdin** without any process-lifecycle management." — Upstream follow-up | RPC command for reload didn't exist upstream; kill-and-respawn workaround chosen | RPC command for `prompt` (which dispatches slash commands via `session.prompt(text)`) **already exists**. The architecture they anticipated is now usable — for prompt dispatch specifically |
| `fix-extension-slash-commands-in-dashboard` | 2026-05 (in progress) | "**Path C rejected**. Server-as-direct-RPC-client ... too invasive ... bridge architecturally inconsistent." | Assumed Path B (`pi.dispatchCommand`) would land in pi 0.71+ | Two minor versions later (0.71 → 0.74), Path B has not landed. Empirically: `echo '{"type":"prompt","message":"/flows:new","id":"1"}' \| pi --mode rpc` dispatches correctly via `session.prompt` (`docs/slash-command.md:88,174`) |

### Empirical justification

`@earendil-works/pi-coding-agent@0.74.0` `dist/core/extensions/types.d.ts` — `ExtensionAPI` lists `on, registerTool, registerCommand, registerShortcut, registerFlag, registerMessageRenderer, getFlag, sendMessage, sendUserMessage, appendEntry, setSessionName, getSessionName, setLabel, exec, getActiveTools, getAllTools, setActiveTools, getCommands, setModel, getThinkingLevel, setThinkingLevel, registerProvider, unregisterProvider, events`. **No `dispatchCommand`, no `prompt`, no `session`.** `grep -rn "dispatchCommand" dist/` returns zero matches.

Pi RPC mode's `prompt` command (defined in `dist/modes/rpc/rpc-mode.js`) calls `session.prompt(text, {expandPromptTemplates: true, ...})` which runs `_tryExecuteExtensionCommand`. The architecture pi exposes for "host-to-session dispatch" is RPC stdin, not the extension API.

Reference architecture: IgorWarzocha/howcode (`desktop/runtime-host/live-runtime-registry.ts`) embeds pi as a library via `createAgentSession` and gets `session.prompt` directly. We don't adopt that pattern (it loses cross-restart durability), but it confirms `session.prompt` is the only host-side dispatch entry pi exposes.

## What Changes

- **NEW**: A per-session Node keeper sidecar (`packages/server/src/rpc-keeper/keeper.cjs`, ~120 LOC). The keeper spawns pi as its child with `stdio: ["pipe", logFd, logFd]`, listens on a per-session UDS (Unix: `~/.pi/dashboard/sessions/<sessionId>.rpc.sock`) or named pipe (Windows: `\\.\pipe\pi-rpc-<sessionId>`), and forwards every JSON line received from the server to pi's stdin. Keeper outlives dashboard server restarts.
- **MODIFIED**: `packages/server/src/process-manager.ts::spawnHeadless` no longer launches pi directly. It launches the keeper, which launches pi. Both Unix and Windows take this path uniformly. The Unix `tail -f /dev/null | pi` shell wrapper is dropped (durability is now provided by the keeper, not the wrapper).
- **MODIFIED**: `packages/server/src/headless-pid-registry.ts` tracks the keeper PID alongside the pi PID per session. Lifecycle: server orphan-cleanup on startup detects keeper-without-pi (pi crashed) and keeper-without-server-link (orphan from dead session); both are killed. New method `writeRpc(sessionId, line: string): boolean` connects to the session's UDS and writes the line.
- **NEW**: Bridge → server message `dispatch_extension_command { sessionId, command, requestId }` (added to `packages/shared/src/protocol.ts`). Bridge sends it when `isExtensionSlashCommand` matches AND `pi.dispatchCommand` is unavailable. Bridge no longer emits the stopgap error in this scenario for sessions known to be RPC-mode (the bridge can detect this via env var `PI_DASHBOARD_HEADLESS=1` set by the spawn flow).
- **MODIFIED**: `packages/server/src/browser-gateway.ts` (or a new `slash-rpc-router.ts`) handles the new bridge message: it writes `{"type":"prompt","message":"<command>","id":"<requestId>"}` to the session's keeper socket, emits `command_feedback {status:"started"}` to the browser, and (best-effort) emits `{status:"completed"}` once the keeper acknowledges (or `{status:"error"}` on socket failure).
- **MODIFIED**: `packages/extension/src/slash-dispatch.ts::tryDispatchExtensionCommand` — when extension command detected AND `pi.dispatchCommand` is absent AND the bridge is running in a headless RPC pi (env probe), emit `dispatch_extension_command` to the server instead of the stopgap. For non-headless sessions (tmux / wt), keep the stopgap behavior (no stdin route exists).
- **MODIFIED**: `command-routing` capability — step 9 (extension-command dispatch) now describes a **three-way decision**: (a) `pi.dispatchCommand` present → call directly; (b) absent + headless session → emit `dispatch_extension_command`, server routes via keeper; (c) absent + non-headless → stopgap error (existing behavior).
- **NOT INTRODUCED**: A change to the bridge ↔ server WS protocol for non-slash session ops. Send_prompt for non-slash text continues over the bridge WS path. Abort, model switch, thinking-level, compaction all unchanged. **The dual-channel boundary is narrow and intentional** (see "Addressing the architectural-inconsistency concern" below).
- **NOT INTRODUCED**: Stdout capture from pi via the keeper. Pi's RPC stdout responses are ignored — events flow back over the bridge WS path because the bridge extension is loaded inside the same pi process and emits its own events through the existing WS connection.
- **NOT INTRODUCED**: Multi-instance keepers per session, keeper supervision (auto-restart on crash), or cross-host UDS forwarding. v1 keeps the keeper minimal: one keeper per session, dies with pi.
- **NOT INTRODUCED**: A change to the tmux / windows-terminal spawn paths. Those continue without RPC stdin; their slash-command experience remains the existing stopgap (documented limitation — users typing `/ctx-stats` in a tmux-spawned dashboard session see the same "requires pi 0.71+" message).

## Addressing the architectural-inconsistency concern

The 2026-05 `Path C rejected` decision (`fix-extension-slash-commands-in-dashboard/design.md:64`) cited two reasons:

1. **"too invasive"** — touches `process-manager.ts`, `pi-gateway.ts`, browser-handlers, command-handler in one change.
2. **"bridge architecturally inconsistent"** — bridge owns most session ops; routing one operation around it splits responsibilities.

This proposal addresses #1 by **narrowing the scope** (slash dispatch only; everything else stays on the bridge) and by **leveraging existing infrastructure** (`headlessPidRegistry`, `spawnPiSession`, the `dispatch_extension_command` message replaces a tightly-scoped stopgap branch — it does not rewire `pi-gateway.ts` or `command-handler.ts` broadly). Total dashboard delta is ~430 LOC, half of which is the new keeper script and its tests.

This proposal addresses #2 by **explicitly defining the dual-channel boundary** in the spec:

- **Bridge WebSocket channel** owns: every send_prompt that is NOT an extension slash dispatch (passthrough text, skill expansion, prompt templates, multi-line, image-bearing); abort; model switch; thinking-level; compaction; rename; events back to server; flow control; everything currently on the bridge.
- **Server → keeper UDS channel** owns: extension slash command dispatch only (`{"type":"prompt","message":"/cmd"}`).
- **headlessPidRegistry direct kill** (already a third out-of-band channel today) owns: kill-by-pid for shutdown, force-kill, and reload-via-respawn.

The boundary is narrow, explicit, and grounded in capability: the bridge **cannot reach** `session.prompt` from inside pi (the central architectural constraint of pi 0.74 ExtensionAPI); the server **can** because it owns the spawn and (now) the keeper. Routing the operations the bridge cannot perform via a separate channel is not architectural inconsistency — it is the correct shape given the constraint.

The alternative ("everything via stdin RPC, retire the bridge") is the howcode pattern; it would resolve the inconsistency by collapsing channels but requires losing cross-restart durability AND rewriting several thousand LOC of bridge-side functionality (event forwarding, openspec polling, git probe, multiselect polyfill, ask-user, asset inlining, etc.). Out of scope.

## Capabilities

### New Capabilities

- `rpc-keeper-sidecar`: per-session keeper process owning pi's stdin, exposing a UDS / named-pipe socket the server writes to; lifecycle (spawn, orphan cleanup, shutdown), socket path conventions, line-framed JSON protocol, error semantics (write to dead pi, write before keeper ready, pi crash with keeper alive, keeper crash with pi alive).
- `extension-rpc-dispatch`: bridge → server `dispatch_extension_command` message, server-side routing to keeper, command_feedback lifecycle from the server side (started / completed / error), feature-detection of headless-vs-non-headless from the bridge.

### Modified Capabilities

- `command-routing`: step 9 (extension-command dispatch) extended with a three-way decision (dispatchCommand → dispatch_extension_command via server → stopgap). The existing stopgap scenario is preserved for non-headless sessions; new scenario covers headless + keeper-present route.
- `headless-spawn`: the spawn mechanism for `--mode rpc` sessions changes (server spawns keeper which spawns pi, instead of server spawning pi directly). The "pi survives server restart" invariant is preserved by the keeper. Process-tracking gains a keeper PID alongside the pi PID.
- `process-manager`: `spawnHeadless` rewritten to spawn keeper. Unix `tail -f /dev/null` wrapper retired. Windows behavior simplifies (was already piping stdin from server; now pipes through keeper to gain restart durability).
- `bridge-extension`: `slash-dispatch.ts` no longer emits the stopgap error path for headless RPC sessions; it emits `dispatch_extension_command` instead. Stopgap remains the fallback when no extension-command route is reachable (tmux/wt sessions, or when headless-detection probe fails closed).

## Impact

- **MODIFIED files**:
  - `packages/server/src/process-manager.ts` — spawn-keeper instead of spawn-pi (~80 LOC delta)
  - `packages/server/src/headless-pid-registry.ts` — keeper PID tracking + `writeRpc` method (~40 LOC delta)
  - `packages/server/src/browser-gateway.ts` (or new `slash-rpc-router.ts`) — receive `dispatch_extension_command`, route to keeper (~40 LOC delta)
  - `packages/server/src/browser-handlers/session-action-handler.ts` — possibly adjust orphan-detection invariants for keepers (~10 LOC delta)
  - `packages/extension/src/slash-dispatch.ts` — emit `dispatch_extension_command` on no-`dispatchCommand`-but-extension-cmd path when headless (~30 LOC delta)
  - `packages/extension/src/bridge-context.ts` — small `isHeadlessRpcSession()` helper (env probe) (~10 LOC delta)
  - `packages/shared/src/protocol.ts` — new message type, both directions (~10 LOC)
  - `packages/server/src/__tests__/` — new test files for keeper + router; existing routing tests updated (~250 LOC new test code)
  - `packages/extension/src/__tests__/bridge-slash-command-routing.test.ts` — assert new message emission instead of stopgap error in the no-dispatchCommand-but-headless case
- **NEW files**:
  - `packages/server/src/rpc-keeper/keeper.cjs` — the keeper entry script (~120 LOC, CommonJS-pure to run under bare node like `preload-fastify.cjs`)
  - `packages/server/src/rpc-keeper/keeper-manager.ts` — server-side helper to spawn / track / write to keepers (~100 LOC)
  - `packages/server/src/__tests__/rpc-keeper-manager.test.ts` — unit tests with mock pi process
- **MODIFIED docs**:
  - `docs/architecture.md` — new "RPC keeper sidecar" subsection; explicit dual-channel boundary diagram
  - `docs/slash-command.md` — Decision 1 updated (Path C reopened with keeper, scoped to headless-only); flow diagram extended; cite this change name
  - `AGENTS.md` Key Files — entries for `keeper.cjs`, `keeper-manager.ts`, `slash-dispatch.ts` (updated)
  - `CHANGELOG.md` `[Unreleased] → Fixed` — extension slash commands now dispatch correctly in headless sessions
- **Backward compatibility**:
  - Old bridges (without `dispatch_extension_command`) continue to emit the stopgap error feedback as before; server still accepts them.
  - Old servers (without keeper / without `dispatch_extension_command` handler) treat the bridge message as unknown and the bridge's send is a no-op (the stopgap UX falls back to today's behavior).
  - Existing tmux / wt session paths unchanged; users running pi via tmux see the stopgap exactly as today.
- **Durability**: the new architecture preserves the "pi survives dashboard server restart" invariant on Unix AND Windows uniformly. Today, Windows already loses pi on server death (`process-manager.ts:491-498`); the keeper resolves that regression too.
- **Risk**: a new long-lived sidecar per session is a new failure surface. Risks itemized in design.md include: keeper crash leaving pi orphaned, keeper-pi PID race during shutdown, UDS / named-pipe cleanup on crash, Windows named-pipe permission semantics, jiti/TS-loader-free invocation of keeper.cjs, server reconnect to existing keeper sockets on startup.

## Depends On

This change DEPENDS ON `fix-extension-slash-commands-in-dashboard` shipping first. That change establishes:
- The numbered routing-order spec in `command-routing` (steps 1–11).
- The `isExtensionSlashCommand` predicate in `bridge-context.ts`.
- The `slash-dispatch.ts` shared helper used by both `bridge.ts::sessionPrompt` and `command-handler.ts`'s slash else-arm.
- The `command_feedback` lifecycle (`started` → `completed`/`error`) and the client reducer's started→terminal upsert.

This change EXTENDS the routing step 9 from "dispatch via `pi.dispatchCommand` or stopgap" to "dispatch via `pi.dispatchCommand` or `dispatch_extension_command` via server (when headless+keeper) or stopgap (when neither route reachable)".

## References

### Prior OpenSpec decisions (cited above)

- `openspec/changes/archive/2026-03-24-headless-spawn/design.md:19` — "Direct stdin/stdout RPC pipe from server to headless pi (future enhancement)" listed as Non-Goal.
- `openspec/changes/archive/2026-04-21-headless-reload-via-respawn/design.md:88-90` — "Option B" anticipates server-writes-to-pi-stdin as the clean architecture: "The server could then write the command to stdin without any process-lifecycle management."
- `openspec/changes/fix-extension-slash-commands-in-dashboard/design.md:64` — Path C rejected on integration cost + "bridge architecturally inconsistent"; rejection gated on Path B (upstream `dispatchCommand`) shipping.
- `docs/slash-command.md:99-100` — Path A/B/C/D analysis; canonical reference for the slash-dispatch architecture decision tree.

### Empirical evidence

- `docs/slash-command.md:88,174` — `echo '{"type":"prompt","message":"/flows:new","id":"1"}' | pi --mode rpc` empirically dispatches via `session.prompt` and returns `extension_ui_request` from pi-flows.
- `@earendil-works/pi-coding-agent@0.74.0` `dist/core/extensions/types.d.ts` — `ExtensionAPI` surface confirmed; no `dispatchCommand`.
- `@earendil-works/pi-coding-agent@0.74.0` `dist/modes/rpc/rpc-mode.js` — defines the `prompt` RPC command that calls `session.prompt(text)` with full slash dispatch.

### Architectural references

- `packages/server/src/process-manager.ts:409-419` — current Unix `tail -f /dev/null | pi --mode rpc` wrapper (durability invariant source we are replacing).
- `packages/server/src/process-manager.ts:480-525` — current Windows piped-stdin path (already loses durability on server restart; keeper resolves both platforms uniformly).
- `packages/server/src/headless-pid-registry.ts` — existing PID tracking primitive; gains keeper-PID tracking and `writeRpc`.
- IgorWarzocha/howcode `desktop/runtime-host/live-runtime-registry.ts` — alternative architecture (embed-pi as a library) considered and rejected because it would lose cross-restart durability entirely (in-process AgentSession dies with the server).
