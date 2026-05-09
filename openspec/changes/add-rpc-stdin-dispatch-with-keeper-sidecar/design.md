## Context

The dashboard currently sees typed extension slash commands (`/ctx-stats`, `/curator`, `/agents`, `/flows:new`, …) fail with a stopgap error feedback because pi's `ExtensionAPI` (verified through pi 0.74) exposes no path to `AgentSession._tryExecuteExtensionCommand`. The expected upstream PR (`pi.dispatchCommand`) has not landed across pi 0.71–0.74. Pi RPC mode's `prompt` command IS exposed and DOES dispatch slash commands via `session.prompt(text)` (empirically confirmed: `docs/slash-command.md:88,174`).

Today's headless spawn (`pi --mode rpc`) is wrapped in `sh -c 'tail -f /dev/null | pi --mode rpc'` on Unix specifically so pi's stdin survives across dashboard server restarts (`process-manager.ts:409-419`). Windows already pipes stdin from the server (`process-manager.ts:480-525`) and accepts "pi dies with dashboard" as a documented trade-off. To write to pi's stdin from the server while preserving the Unix durability invariant, we need an intermediary process that owns the pipe — a keeper sidecar.

This change introduces the keeper, exposes a per-session UDS / named-pipe socket the server writes to, and routes typed extension slash commands through `bridge → server → keeper → pi.stdin → session.prompt → handler`. Everything else stays on the existing bridge WebSocket path.

## Goals / Non-Goals

**Goals:**
- Typed `/ctx-stats` (and every other extension slash command) actually runs its handler in headless dashboard sessions, against unmodified upstream pi 0.74.
- Cross-restart durability preserved on Unix AND made consistent on Windows (today Windows loses pi on server death; the keeper fixes that as a side-effect).
- Bridge's existing channel ownership preserved for everything except slash dispatch. No re-routing of send_prompt for non-slash text, abort, model switch, thinking-level, compaction, events.
- Backward compat: old bridges continue to emit the stopgap; old servers reject the new bridge message gracefully; tmux/wt sessions retain today's stopgap.

**Non-Goals:**
- Replacing the bridge with stdin RPC for non-slash operations (would re-fight the howcode embed-pi vs bridge debate).
- Keeper supervision / auto-restart on crash. v1: keeper dies with pi, both get respawned together.
- Cross-host UDS forwarding. v1: keeper UDS is local-only.
- Stdout capture from pi via the keeper. Events flow back over the bridge WS path because the bridge is loaded inside the same pi process.
- `session.prompt` for tmux / Windows Terminal sessions (no stdin route exists; the user's terminal owns stdin).

## Decisions

### Decision 1: Process topology — three-process per headless session

```
dashboard server (1 process)
   │
   ├── connects via UDS for slash dispatch
   ▼
keeper.cjs (1 per session)         ← OWNS pi's stdin pipe
   │
   ├── stdio[0]=pipe (forward writes)
   ├── stdio[1]=ignore / log
   ├── stdio[2]=log
   ▼
pi --mode rpc (1 per session)
   │
   ├── loads bridge extension (as today)
   ▼
   bridge.ts WebSocket → dashboard server (events, send_prompt for non-slash, etc.)
```

Keeper is a standalone CommonJS file (`keeper.cjs`) — no jiti, no TS loader, runs under bare Node. Same constraint as `packages/server/preload-fastify.cjs`. Bundled into `packages/server/src/rpc-keeper/keeper.cjs`; resolved at runtime via `path.join(__dirname, "rpc-keeper", "keeper.cjs")`.

**Rationale:** Three roles → three processes. Mixing keeper logic into the dashboard server itself would re-introduce the durability problem (keeper dies with server). Mixing it into pi requires upstream changes (out of scope). A standalone keeper is the minimal independent owner of pi's stdin.

**Alternative considered:** systemd / launchctl supervision. Rejected — adds a per-OS deployment dependency; users running `pi-dashboard start` from a terminal don't have systemd glue.

### Decision 2: Keeper line protocol — JSON-lines, fire-and-forget writes

UDS / named-pipe protocol:

- Server connects, writes one JSON object per line, server closes (or keeps open and pipelines — either is valid).
- Keeper reads each line, validates `typeof line === "string"`, writes it verbatim to pi's stdin appended with `\n`.
- Keeper does NOT parse or validate JSON shape — it forwards raw lines. The semantic is "the server speaks pi RPC; keeper is dumb wire."
- Keeper does NOT respond on the UDS. Acknowledgement is implicit: socket connect succeeds, write succeeds, line was forwarded. The keeper does NOT confirm "pi accepted the line" — that confirmation arrives via bridge events over the bridge WS path.

**Rationale:** The simplest possible protocol. Pi events flow via the existing bridge WS, so the keeper has no reason to capture pi's stdout. Bidirectional protocol on the UDS would duplicate the bridge.

**Trade-off:** Server cannot detect "pi rejected the RPC line" via the keeper. If pi rejects, no `command_feedback {status:"completed"}` arrives within the bridge timeout window and the server emits `{status:"error"}`. Acceptable — pi RPC errors are rare and the timeout fires fast (~5s).

### Decision 3: Socket / pipe path conventions

| OS | Socket path |
|---|---|
| Unix (macOS, Linux) | `~/.pi/dashboard/sessions/<sessionId>.rpc.sock` |
| Windows | `\\.\pipe\pi-rpc-<sessionId>` |

**Rationale:** Per-session paths align with existing per-session log file conventions (`packages/server/src/process-manager.ts:484` — `pi-spawn-${ts}-${rand}.log` already uses this directory). On Unix, dashboard server has write permission to `~/.pi/dashboard/sessions/`; UDS socket inherits parent dir perms (mode 0700 by default). On Windows, named pipes accept the dashboard's user SID by default.

**Alternative considered:** Single multiplexed socket (`~/.pi/dashboard/rpc.sock`) with sessionId framing on the wire. Rejected — multiplexing on top of UDS adds complexity; per-session sockets are simpler and align with existing per-session resource paths.

### Decision 4: Server reconnect to existing keepers on startup

When the dashboard server starts (or restarts), it scans `~/.pi/dashboard/sessions/*.rpc.sock` (Unix) and the equivalent on Windows. For each socket:

1. Read the keeper PID from the corresponding `.rpc.pid` sidecar file (keeper writes its PID at startup; cleans up on graceful shutdown).
2. If keeper PID is alive AND pi PID (via `headlessPidRegistry`) is alive → reconnect, mark session ready for slash-dispatch.
3. If keeper PID is dead OR pi PID is dead → unlink socket + pid sidecar; orphan-cleanup logic kills the surviving half if any.

The keeper also writes a `<sessionId>.rpc.ready` marker after pi's first JSON line is acknowledged on stdout (or after a short startup delay) so the server doesn't write before pi's RPC reader is bound.

**Rationale:** Keepers must outlive the server; the server must rediscover them. A PID sidecar is simpler than parsing socket peer info or running a ping protocol on each reconnect.

**Alternative considered:** Server holds keeper PID in memory only, loses track on restart. Rejected — defeats durability.

### Decision 5: Bridge "am I in a headless RPC pi?" detection

The bridge probes:
- `process.env.PI_DASHBOARD_SPAWNED === "1"` (already set today by `process-manager.ts::buildSpawnEnv`)
- AND argv contains `--mode` followed by `rpc`

Both must be true for the bridge to route slash dispatch via `dispatch_extension_command`. Otherwise the bridge falls back to today's stopgap (tmux / wt sessions, or any unrecognized spawn shape).

**Rationale:** Existing env var avoids adding a new flag. Argv probe disambiguates RPC from interactive (which can also be dashboard-spawned via tmux).

**Alternative considered:** Add a new env var `PI_DASHBOARD_HEADLESS=1` set only by `spawnHeadless`. Rejected — `PI_DASHBOARD_SPAWNED + --mode rpc` is already unambiguous and adding a third env flag clutters the spawn env.

### Decision 6: Three-way routing in `slash-dispatch.ts::tryDispatchExtensionCommand`

Updated decision tree (extends the existing helper, does not replace it):

```ts
if (!isExtensionSlashCommand(text, commands)) return false;

emit started;

if (hasDispatchCommand(pi)) {
  // Path B (when upstream lands)
  await pi.dispatchCommand(text, { streamingBehavior: "followUp" });
  emit completed;
  return true;
}

if (isHeadlessRpcSession()) {
  // NEW: Path C via keeper
  connection.send({ type: "dispatch_extension_command", sessionId, command: text, requestId });
  // Server emits started/completed/error via the dispatch-router; bridge does not re-emit.
  return true;
}

// Stopgap (unchanged from fix-extension-slash-commands-in-dashboard)
emit error with PI_071_REQUIRED message;
return true;
```

**Rationale:** Three independent code paths, each with its own predicate. No fallthrough between them. Adding a new path doesn't change existing behavior for any existing scenario.

**Important:** The bridge emits the `started` event (it already does this). The server emits the `completed`/`error` for the keeper path because only the server knows whether the UDS write succeeded. The bridge MUST NOT emit a terminal event for the dispatch_extension_command path — that would duplicate. The existing reducer dedup (started→terminal upsert) handles the cross-process timing.

### Decision 7: Server-side lifecycle for dispatch_extension_command

```ts
// new: packages/server/src/rpc-keeper/dispatch-router.ts
async function handleDispatchExtensionCommand(msg, ctx) {
  const { sessionId, command, requestId } = msg;
  const ok = ctx.headlessPidRegistry.writeRpc(sessionId,
    JSON.stringify({ type: "prompt", message: command, id: requestId }));
  if (!ok) {
    ctx.broadcastToBrowser(sessionId, {
      type: "command_feedback", command, status: "error",
      message: "RPC keeper unavailable (session may have ended)",
    });
    return;
  }
  // Optimistic completion: if the write succeeded, pi will dispatch.
  // Pi's events arrive via bridge WS; if pi rejected the line we'd see
  // an extension_error event there. We emit "completed" eagerly so the
  // chat row transitions out of "in progress".
  ctx.broadcastToBrowser(sessionId, {
    type: "command_feedback", command, status: "completed",
  });
}
```

The "completed" emission is **optimistic**. Pi's `_tryExecuteExtensionCommand` either runs the handler (events flow normally over bridge WS) or emits `extension_error` (also forwarded via bridge WS, already rendered as a chat error row). So in the very rare case pi rejects the dispatch, the user sees:
1. Optimistic "completed" feedback (briefly)
2. Followed by an `extension_error` chat row from pi

Acceptable. Alternative would require parsing pi's RPC stdout in the keeper, reintroducing complexity.

### Decision 8: Keeper / pi lifecycle invariants

| Event | Behavior |
|---|---|
| Keeper starts → spawns pi | pi attached to keeper as stdio child; if pi exits, keeper exits too (via `pi.on('exit', () => process.exit(...))`) |
| pi crashes | keeper detects exit, unlinks socket + pid file, exits 0 |
| Keeper crashes | pi loses stdin → reads EOF → exits (current Windows behavior, now also Unix behavior); server's existing pi-PID death detection fires |
| Server restart | keeper survives; on server boot, reconnect via Decision 4 |
| Session shutdown (via `kill`) | server kills pi PID → pi exits → keeper exits via above |
| Force-kill | server kills both keeper PID and pi PID; cleans up socket + pid file |
| Keeper UDS socket disappears (manually rm'd) | server's next `writeRpc` fails; emits "error" feedback; bridge stays unaware |

**Cleanup invariant:** every successful session shutdown removes the socket file + pid sidecar. Server startup orphan-cleanup removes any leftover pair where neither PID is alive.

### Decision 9: Keeper as a TypeScript-free CommonJS file

`keeper.cjs` does not depend on jiti, tsx, or any TS toolchain. It uses only built-in Node modules: `child_process`, `net`, `fs`, `path`. This mirrors `packages/server/preload-fastify.cjs` (~60 LOC, also CJS-pure).

**Rationale:** Keeper must spawn before pi is ready, on a node binary that may be the bundled Electron node, the system node, or `~/.pi-dashboard/node`. Adding a TS loader to that startup path adds 50–200ms of jiti warm-up and a new failure mode (loader-not-found). Built-in modules only.

**Trade-off:** No type-checking against `protocol.ts`. Mitigated by writing a Vitest unit test (`keeper.test.cjs`) that pins the JSON-line forwarding behavior with a mock pi child.

### Decision 10: Test strategy

| Layer | File | What |
|---|---|---|
| Keeper standalone | `packages/server/src/rpc-keeper/__tests__/keeper.test.cjs` | spawn keeper as a real subprocess in test, connect to its UDS, write lines, assert child stdin receives them |
| Manager | `packages/server/src/__tests__/rpc-keeper-manager.test.ts` | unit test the server-side registration / writeRpc / orphan cleanup with mocked `child_process` |
| Dispatch router | `packages/server/src/__tests__/dispatch-extension-command-router.test.ts` | drive `handleDispatchExtensionCommand` with a mock keeper-manager, assert browser emissions and writeRpc calls |
| Bridge wiring | `packages/extension/src/__tests__/bridge-slash-command-routing.test.ts` (extended) | assert dispatch_extension_command emission for headless+no-dispatch case; stopgap for non-headless |
| Integration smoke | manual, documented in tasks.md | spawn a real headless pi, type `/ctx-stats`, verify chat shows the stats card |

## Risks / Trade-offs

- **[New process per session = new failure surface] → Mitigations**: keeper is ~120 LOC of CJS-only Node, surface is small; test coverage exercises crash paths; orphan cleanup runs on every server boot; if keeper fails to spawn, server falls back to non-keeper headless spawn (degraded mode: today's stopgap).

- **[UDS / named-pipe permission edge cases on Windows] → Mitigation**: dashboard's named pipe ACL defaults to "creator full control"; only the same user's processes can connect. Document in design.md that running dashboard as a different user than pi is not supported (already the case today).

- **[Optimistic "completed" can mislead user when pi rejects the dispatch] → Mitigation**: pi rejection is already followed by an `extension_error` chat row from pi's own runner; user sees both. Future enhancement: keeper proxies pi's RPC stdout response to confirm dispatch — deferred.

- **[Keeper survives server crash; orphaned keepers accumulate if cleanup is skipped] → Mitigation**: server's existing `cleanupOrphans` pass (every startup) extends to UDS sockets + pid sidecars. Documented in tasks.md.

- **[Race: server restart while bridge is mid-emission of `dispatch_extension_command`] → Mitigation**: bridge already retries WS messages on disconnect (existing exponential backoff). Server's reconnect rebuilds the keeper-manager from socket scan before the bridge reconnects. Worst case: bridge resends the dispatch; idempotent at pi (pi runs the handler twice). Acceptable for v1; tasks.md flags as a known caveat.

- **[bridge-architecturally-inconsistent concern, raised in fix-extension-slash-commands-in-dashboard/design.md] → Mitigation**: dual-channel boundary explicitly defined in proposal.md and in `command-routing` capability spec. Bridge cannot reach `session.prompt`; server can. Routing through the channel that has the capability is correct, not inconsistent. Documented prominently in `docs/architecture.md` and `docs/slash-command.md`.

- **[Replacing the Unix `tail -f /dev/null` wrapper has cross-cutting effects on spawn / stderr / PID indexing] → Mitigation**: `headlessPidRegistry.byCwd / byPid / byToken` indexing already handles "spawn PID differs from session PID" (commit `a-3-2026 spawn-correlation-token`). Keeper PID becomes the new "spawn PID"; pi PID becomes the registered session PID via existing token correlation. No new indexing logic needed.

## Migration Plan

Two-phase rollout, gated by build version:

**Phase 1: ship change as a feature, off by default.**

- Keeper code lives in repo, not invoked.
- `process-manager.ts::spawnHeadless` retains current `tail -f` wrapper.
- Bridge `slash-dispatch.ts` retains today's stopgap.
- One config flag in `~/.pi/dashboard/config.json`: `useRpcKeeper: false` (default).

**Phase 2: enable by default.**

- `useRpcKeeper: true` becomes the default after a release cycle of beta testing.
- `tail -f` wrapper retired in same release.
- Documented in CHANGELOG; users with custom spawn scripts (rare) need to migrate.

Rollback strategy: flip `useRpcKeeper` back to false; old `tail -f` path still exists; revert is one commit.

## Open Questions

1. **Should the keeper batch writes?** Pi's RPC reader handles one JSON line per stdin write. If the user types 10 slash commands in 10 seconds, that's 10 UDS connects. Could we keep the connection open and pipeline? Probably yes; not v1.

2. **Should the keeper be bundled into the `pi-dashboard-server` npm package or shipped as a separate file?** Inside the package keeps it co-versioned. Decided: bundle inside; refer via `path.join(__dirname, "rpc-keeper", "keeper.cjs")` resolved at runtime.

3. **Windows named pipe vs UDS-on-Windows-via-AF_UNIX?** Windows 10+ supports AF_UNIX sockets natively. Could we use a single `*.sock` path on both OSes? Probably yes. v1: stick with Windows named pipes for simplicity.

4. **Bridge env probe for `--mode rpc`** — does pi pass argv through to the extension's `process.argv`? Confirmed (extensions run in pi's process; `process.argv` is pi's invocation). No change needed.

5. **What happens if a tmux session somehow gets a `dispatch_extension_command` message?** Bridge probe should prevent this. Defensively, server's `writeRpc(sessionId, line)` returns false when no UDS exists for that session, server emits error feedback. Belt-and-suspenders.

6. **Should the keeper also handle `abort`, `compact`, etc.?** Tempting, but out of scope. The bridge already handles those via WS. Adding keeper-routes for them would duplicate transport without solving a user-visible problem. Defer.

7. **Should we pre-emptively file the upstream `pi.dispatchCommand` PR?** Yes — even if this change ships, having upstream support means the keeper becomes redundant on pi 0.75+ and we can deprecate it. Recommended as a separate task / change after this lands.
