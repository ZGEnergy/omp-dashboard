## Context

Four unrelated regressions share one characteristic: they each surface at a tight integration boundary where one layer assumes a behaviour the neighbouring layer does not provide.

```
┌──────────────────────────────────────────────────────────────────┐
│                  Regression → Integration Boundary                │
├──────────────────────────────────────────────────────────────────┤
│ 1. detach:false      Electron.main  ↔  spawnDetached             │
│ 2. + Session fails   BrowserHandler ↔  selectMechanism/pty       │
│ 3. No progress bar   server WS      ↔  client hooks/components   │
│ 4. /reload stale     package mgr    ↔  pi-coding-agent reload    │
└──────────────────────────────────────────────────────────────────┘
```

All four fixes are additive and low-risk. The hardest is #4, where the true defect is in pi-coding-agent (not controllable from this repo); we implement a defensive readback instead of a fantasy fix.

## Goals / Non-Goals

**Goals**
- Eliminate Windows console flash on Electron-launched dashboard server.
- Make "+ Session" spawn failures diagnosable in the UI.
- Show real download progress (bytes received/total, stage) for package operations.
- Make stale `/reload` after install *visible* to the user.

**Non-Goals**
- Modifying `pi-coding-agent` itself (Fix 4 is a workaround).
- Re-architecting the spawn mechanism pipeline (only a narrow `wt → headless` fallback).
- Adding new WebSocket message types beyond the two explicitly listed.
- Migrating package operations to a job-queue model.
- Anything related to the pending `origin/develop` merge itself.

## Decisions

### D1 — Add `detach: false` at the Electron call site, not change the default

**Chosen**: Pass `detach: false` explicitly in `server-lifecycle.ts::launchServer`.
**Alternative**: Flip `spawnDetached`'s default from `true` → `false`.
**Rationale**: The default exists because `pi-session` and `process-manager.spawnHeadlessDetached` require `detach: true` on non-Windows for PGID-based tree-kill semantics. Flipping the default would break every other caller. The Electron server is the odd one out — it *wants* to die when the parent dies, because Electron owns its lifecycle via `stopServerIfNeeded()`.

### D2 — Surface spawn errors via a new `spawn_error` browser message (not via toast)

**Chosen**: New `spawn_error` message in `ServerToBrowserMessage` union, rendered by `FolderActionBar`/`SessionSpawnCard`.
**Alternative**: Use the generic `notify` prompt bus adapter.
**Rationale**: Spawn errors are structurally tied to the spawn card that triggered them. A toast disappears; the card needs a retry button + persistent error text. Also, `AGENTS.md` explicitly warns that all browser message types MUST be in `ServerToBrowserMessage` or esbuild strips the switch case — adding a first-class message type keeps that invariant honest.

### D3 — `wt → headless` fallback on absence, not on failure

**Chosen**: Probe for `wt.exe` presence via `ToolResolver.which("wt")` at spawn time. If absent, demote to `headless` before attempting to spawn.
**Alternative**: Let `wt` spawn fail, catch the error, retry as `headless`.
**Rationale**: Failure-based fallback duplicates latency (one failed spawn + one successful spawn) and muddies error logs. Presence-based fallback is one synchronous `which` call; cached by `ToolResolver` after first call. Log the degradation once per server run with a pointer to the Windows Terminal install page.

### D4 — Progress rendering is purely client-side; no protocol additions for progress

**Chosen**: The existing `package_operation_progress` message already carries `{ operationId, phase, bytesReceived?, bytesTotal? }`. Client stores last frame per operationId in a `Map` inside `usePackageOperations`.
**Alternative**: Add a new `package_progress_v2` with richer fields.
**Rationale**: The message already carries enough to render a good progress bar. If `bytesTotal` is absent, render an indeterminate (barber-pole) bar and show the `phase` label. Determinate bar when both values are present. Zero protocol risk; fully forward-compatible.

### D5 — `/reload` readback via pi gateway with 5 s budget

**Chosen**: After `/reload` is sent, wait up to 5 s for the session to emit an `extensions_loaded` event (or poll the session's `loadedPackages` field if exposed). If the newly installed package name is not present, emit `package_reload_incomplete`.

**Alternative A**: Force-kill and respawn the session after install.
**Alternative B**: Do nothing — users will restart sessions when something looks off.

**Rationale**: (A) is too destructive — users may have unsaved context. (B) is the status quo and is what the user reported as the bug. (D5) is a visible-but-non-destructive middle path: the user now knows a restart is needed and can decide when. The 5 s budget is generous for pi's reload path (measured ~1 s typical).

### D6 — No test-suite run in CI for this change; targeted vitest only

**Chosen**: Each fix adds ≤2 focused test files. Apply skill runs those directly, not the whole suite.
**Rationale**: The repo convention from `prep-for-develop-merge` tasks.md: "`npm test` is unreliable in this repo. Run *targeted* vitest invocations against specific test files only." Inherit that policy here.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `detach: false` on Electron breaks headless-survives-Electron-crash expectations | Documented non-goal. Electron *owns* the server lifecycle on purpose; if Electron dies, the user can relaunch and mDNS/health-probe will auto-adopt. |
| `wt → headless` fallback silently hides user's intent ("I wanted a real terminal tab") | One-time log line + a dashboard server-log entry per server run. No runtime surprise — fallback only fires when `wt.exe` is genuinely absent. |
| `/reload` readback races: session finishes reload within 5 s but event hasn't propagated yet | 5 s budget with indeterminate bar on client. If the warning fires spuriously, user can dismiss; false-positive cost is a dismissible toast. |
| Progress frame flood for small downloads saturates WebSocket | Server already throttles progress to ~10 Hz. Client reducer is O(1) per frame. No batching needed. |
| Electron test can't easily import server-lifecycle.ts with its side effects | Extract the `spawnDetached` call into a pure `buildServerSpawnOptions()` helper; test that instead. Same pattern used by `buildSpawnDetachedOptions` in the extension. |

## Migration Plan

This change is a direct fix; no migration needed.

1. Land all four fixes on `develop` in sequence (Electron → spawn errors → progress → reload readback).
2. Ship in next release.
3. Post-release: file upstream pi-coding-agent issue for Fix 4's real fix; remove the workaround when upstream lands.

Rollback: each fix is isolated to its own commit. Reverting any single commit leaves the other three intact.

## Open Questions

- **Q1**: Does pi emit a structured `extensions_loaded` or `reload_complete` event today? If not, Fix 4's readback needs a different signal (e.g., re-query `pi_gateway` for the session's manifest). *Action in tasks: investigate before implementing readback.*
- **Q2**: Should the "+ Session" error surface also apply to "+ Terminal"? Terminal spawn already has its own error path — leave terminal alone for this change; revisit only if users report the same symptom there.
- **Q3**: Are `package_operation_progress` `bytesTotal` values accurate for git-source installs (which don't know total bytes ahead of time)? *Likely no — indeterminate bar will be normal for git sources. Acceptable.*
