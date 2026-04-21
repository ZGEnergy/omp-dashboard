# Design — unified-bootstrap-install

Captures the full exploration (2026-04-20 conversation with robson) behind this proposal. Nothing should be lost on implementation.

## 1. Mechanism tradeoff (Q1 in exploration)

Four mechanisms considered for delivering pi when not globally installed:

```
┌─── MECHANISM ───────────────┬── PROS ────────────┬── CONS ──────────────┐
│ (a) Runtime dep in          │ zero first-run     │ +30–50 MB per        │
│     pi-dashboard-server's   │ latency            │ install; pi upgrade  │
│     package.json            │                    │ requires dashboard   │
│                             │                    │ release; version     │
│                             │                    │ pinning rigid        │
├─────────────────────────────┼────────────────────┼──────────────────────┤
│ (b) optionalDependencies    │ graceful degrade   │ silent failures;     │
│                             │                    │ hides real bugs      │
├─────────────────────────────┼────────────────────┼──────────────────────┤
│ (c) First-run bootstrap     │ DRY w/ Electron;   │ ~30s first run;      │
│     in cli.ts (reuse        │ pi upgradeable     │ needs network        │
│     installer)              │ independently      │                      │
├─────────────────────────────┼────────────────────┼──────────────────────┤
│ (d) Bundle pi via ncc/      │ single binary      │ breaks pi extensions,│
│     esbuild                 │                    │ skills, native       │
│                             │                    │ modules — rejected   │
└─────────────────────────────┴────────────────────┴──────────────────────┘
```

**Chosen: (c) first-run bootstrap**. Reuses existing Electron installer, single mental model (all install paths converge on `~/.pi-dashboard/`), upgrade story is clean. The ~30s first-run cost is mitigated by degraded-mode startup (Q2).

## 2. Windows `npm i -g pi-dashboard` repro (pre-work C)

For the implementer to confirm the bug still exists before starting:

```
# On a clean Windows VM (or a machine where pi has never been installed):
#
#   1. Install Node.js 22+ from nodejs.org (typical path: C:\Program Files\nodejs)
#   2. Open PowerShell (any shell):
#
#   > npm install -g @blackbelt-technology/pi-agent-dashboard
#   # ... installs to %APPDATA%\Roaming\npm\node_modules\
#
#   > pi-dashboard
#   # Server starts, opens http://localhost:8000 in browser
#
#   Expected: dashboard shows at least one session or an obvious prompt to install pi
#   Actual:   empty session list, no error, no guidance; logs show ToolRegistry
#             resolution for "pi" fails across all strategies.
#
#   Workaround the user had to apply:
#
#   > npm install -g @mariozechner/pi-coding-agent
#   > npm install -g openspec
#   > pi-dashboard  # now works
```

This proposal eliminates the workaround. If on pre-work verification the bug has been fixed by another change, coordinate the snapshot update with `bootstrap-resolution-harness` task 20.1 and reduce this proposal's scope to "degraded mode + upgrade UI + bridge re-registration after install."

## 3. Degraded mode UX (Q2 decision)

**Decided (Q2):** server starts immediately in degraded mode; install runs async in background.

```
 ┌────────────────────────────────────────────────────────────────┐
 │ bootstrap.status   │ Server behavior                           │
 ├────────────────────────────────────────────────────────────────┤
 │ "ready"            │ normal — all endpoints fully operational  │
 │                                                                │
 │ "installing"       │ HTTP + WS up; /api/health OK; pi-dependent │
 │                    │ operations return 202 Accepted with       │
 │                    │ `{status:"queued", reason:"bootstrap     │
 │                    │ installing"}` and queue the request.      │
 │                    │ UI banner: "Installing pi — sessions will │
 │                    │ be available shortly (~30s)".             │
 │                                                                │
 │ "failed"           │ HTTP + WS up; pi-dependent ops return 503 │
 │                    │ with error details.                       │
 │                    │ UI banner: "pi install failed — [Retry]   │
 │                    │ [View logs]".                             │
 └────────────────────────────────────────────────────────────────┘
```

### What counts as "pi-dependent"?

Operations that spawn pi or read pi's installed skills/packages:

- Session spawn (tmux / wt / wsl-tmux / headless)
- Terminal spawn (if shell invokes pi; regular shell terminals are NOT pi-dependent)
- Flow launch
- pi-resource scanning (extensions, skills, prompts)
- Pi-core update endpoints (`/api/pi-core/*`)

NOT pi-dependent:

- Dashboard UI itself, `/api/health`, `/api/bootstrap/status`
- File read/browse/pin endpoints
- Git operations
- Tunnel/editor management
- Session listing (existing sessions load from meta files; no pi required)

### Queueing vs rejecting

Decision per endpoint:

| Endpoint | Behavior during "installing" |
|---|---|
| session spawn | **Queue**. On `ready`, process in order. Client sees `status: queued` with a ticket id. |
| terminal spawn (non-pi) | Proceed normally. |
| terminal spawn (pi shell) | **Reject** with 503 + actionable message. Terminals are interactive; queuing is worse UX than rejection. |
| flow launch | **Queue**. Same ticket pattern. |
| pi-core update | **Reject** — the update endpoint presupposes pi is installed. |
| pi-resource scan | Return empty result with `bootstrap.status: "installing"` passthrough; UI shows "pi not yet installed". |

## 4. Lock file coordination with proposal (3)

Proposal `single-dashboard-per-home` introduces a per-HOME advisory lock. Implication for this proposal:

- The lock MUST be acquired BEFORE `bootstrapInstall` runs. Two simultaneous `pi-dashboard` invocations (race on first install) should not both try to `npm install` into `~/.pi-dashboard/`.
- If the lock is held by another instance, this instance ATTACHES (opens browser to existing dashboard), does NOT run its own bootstrap.
- Whether (3) lands before this proposal affects task ordering. If (3) is live, bootstrap install happens inside the lock. If not, document that concurrent first-run installs are untested; defer hardening to (3).

## 5. Bridge extension in `npm i -g pi-dashboard` layout

Currently `findBundledExtension(baseDir)` looks for `<baseDir>/packages/extension/`. In the npm-g layout:

```
%APPDATA%\Roaming\npm\node_modules\
└── @blackbelt-technology\
    └── pi-agent-dashboard\                              ← npm package
        └── ?                                            ← extension?
```

The published npm package `@blackbelt-technology/pi-agent-dashboard` MUST include `packages/extension/` in its files array (or be published as a monorepo tarball). Verify during implementation:

- Check `packages/server/package.json` `files` field — does it include `../extension`? (Unlikely — cross-package.)
- More likely fix: **publish a parent meta-package** that bundles both `pi-dashboard-server` and `pi-dashboard-extension` into a sibling layout.
- Simpler: make `findBundledExtension` ALSO check `node_modules/@blackbelt-technology/pi-dashboard-extension/` as a sibling — treat it as a normal npm dependency of `pi-dashboard-server` shipped via `dependencies`.

**Recommended**: add `@blackbelt-technology/pi-dashboard-extension` as a `dependencies` entry of `pi-dashboard-server`'s published package.json. Then `findBundledExtension` resolves it via the normal Node module-resolution algorithm, no layout assumptions. Extension is ~100 KB — negligible install overhead.

## 6. Upgrade entry points (Q4 decision)

**Decided (Q4):** both UI and CLI.

### UI path — Settings → Packages tab

The existing `PiCoreVersionsSection.tsx` already lists core packages and supports "Update". Extend it:

- Show pi-coding-agent as a first-class row.
- "Update" triggers `POST /api/bootstrap/upgrade-pi` which calls `bootstrapInstall({ packages: ["@mariozechner/pi-coding-agent"], mode: "upgrade" })`.
- Progress streams via `bootstrap_status_update` WS broadcast.
- On success, trigger `npm run reload`-style broadcast so open pi sessions pick up the new version.

### CLI path — `pi-dashboard upgrade-pi`

New subcommand in `packages/server/src/cli.ts`:

```
$ pi-dashboard upgrade-pi
[pi-dashboard] upgrading pi from 0.5.1 → 0.6.3
[pi-dashboard] ▓▓▓▓▓▓▓░░░  70%
[pi-dashboard] ✓ upgraded in 18s
[pi-dashboard] ! active dashboard at http://localhost:8000 — sessions will
              reload automatically
```

If a dashboard is running when the CLI runs, the CLI attaches via `isDashboardRunning()` and calls the same API endpoint (keeps lock semantics correct). If no dashboard running, runs `bootstrapInstall` directly and exits.

## 7. Version-skew detection

Trigger conditions for a "please upgrade" hint in the UI:

1. Resolved pi version < `piCompatibility.minimum` in `pi-dashboard-server/package.json` → block session spawn with an error.
2. Resolved pi version < `piCompatibility.recommended` → show hint banner but allow operation.
3. Resolved pi version > `piCompatibility.maximum` → show warning ("dashboard may be out of date"), don't block.

Version read from `<resolved-pi-path>/../package.json` at startup. Cache for 60 s.

## 8. API surface

```
GET  /api/bootstrap/status
  → { status: "ready" | "installing" | "failed",
      progress?: { step, pct, output },
      error?:    { message, stack? },
      version?:  { pi: "0.6.3", openspec: "...", tsx: "..." },
      compatibility?: { minimum, recommended, maximum, current } }

POST /api/bootstrap/upgrade-pi
  Body: { packages?: ["@mariozechner/pi-coding-agent", ...] }
  → 202 { ticketId: "..." }  // async; progress via WS
  → 409 if already "installing"

POST /api/bootstrap/retry
  → 202 if status was "failed"
  → 409 if status is "ready" or "installing"

WS broadcast: bootstrap_status_update
  { type: "bootstrap_status_update", payload: <same shape as GET response> }
```

## 9. State machine

```
             ┌─────────┐
  boot  ──►  │   ...   │
             └────┬────┘
                  │ ToolRegistry.resolve("pi")
         ┌────────┴────────┐
         │ found           │ not found
         ▼                 ▼
    ┌─────────┐      ┌──────────┐
    │  ready  │      │installing│ ◄─┐
    └────┬────┘      └────┬─────┘   │
         │                │         │
         │        success │         │ retry
         │                ▼         │
         │           ┌─────────┐    │
         │           │  ready  │    │
         │           └─────────┘    │
         │                          │
         │         failure          │
         │           ┌──────────┐   │
         └──────────►│  failed  │───┘
                     └──────────┘
```

## 10. What happens if user ALSO has a global pi install

Strategy order (unchanged from today):

```
1. override       — explicit user setting
2. bare-import    — dev monorepo
3. managed        — ~/.pi-dashboard/  ← filled by this proposal's bootstrap
4. npm-global     — /usr/lib/... or %APPDATA%\Roaming\npm\...
```

If the user already has `@mariozechner/pi-coding-agent` installed globally, strategy 4 resolves BEFORE this proposal's managed install even runs. But the resolution happens at startup; the bootstrap install fires only if no strategy succeeds.

Pre-install short-circuit:

```
1. Resolve pi.
2. If found → bootstrap.status = "ready" (no install needed)
3. If not found → start "installing"; install into managed; on complete, re-resolve
```

This means users with global pi see no change. Users without see a first-run degraded window followed by "ready".

## 11. Reloading sessions after upgrade

After upgrade-pi completes, existing pi sessions are still running the OLD pi. To pick up the new version:

- Send `reload_all` broadcast to all connected bridges.
- Bridges call their own reload path (existing `scripts/reload-all.sh` equivalent in code).
- Sessions disconnect and reconnect; state persists via meta files.

This is the same mechanism pi-core updates already use — per the `PiCoreVersionsSection` note in AGENTS.md: "auto-reloads sessions on any successful update."

## 12. Tradeoff: in-process npm vs detached subprocess

`dependency-installer.ts` today spawns `npm install` as a child. Options:

- Keep subprocess (current) — simplest, reuses npm logic, isolated failure.
- In-process via `@npmcli/arborist` — faster, more control, but ~2 MB added dep and npm is a moving target.

**Keep subprocess.** The bundled Node + bundled npm already ship in Electron; `pi-dashboard` CLI requires system Node (which has npm). Cross-platform subprocess spawn is solved by v3's `platform/spawn.ts`.

## 13. What if the user has no network on first run?

- `bootstrap.status = "failed"` with error "network unreachable".
- UI banner shows retry + link to "offline install instructions" in docs.
- No auto-retry (avoid noisy retries on airplane wifi).

Future work: offline bundle — ship a tarball of pi-coding-agent + openspec + tsx inside the npm package, use it when `npm install` fails due to network. Out of scope for this proposal but cheap to add later.

## 14. Testing strategy

Four layers:

1. **Unit** — `bootstrapInstall` with mocked subprocess. Happy path, failure, version skew, concurrent calls (serialized via lock).
2. **Bootstrap harness** (proposal 1) — scenario B1 snapshot flips. Scenarios for "pi absent → installing → ready" transitions.
3. **Integration** — extend `test-electron-install.sh` with a new variant that simulates `npm i -g pi-dashboard` fresh: bundled-node, no pi, run `pi-dashboard`, assert degraded mode → install → ready → session spawn succeeds.
4. **Manual** — Windows VM smoke (see validation section of proposal.md).

## 15. Non-obvious consequences captured

From exploration:

- **Degraded mode implies pi-readiness state the UI must render.** Three cases (ready/installing/failed) mapped in design §3.
- **First-run UX is ~30s blocking on first invocation** — mitigated by degraded mode; user can interact with dashboard immediately, session ops just wait.
- **Lock file (proposal 3) must acquire BEFORE bootstrap install** to prevent two instances racing on npm install.
- **Bundled extension in npm-g layout** requires publishing strategy decision (§5) — currently unresolved; recommend adding extension as runtime dep of pi-dashboard-server.
- **Global pi takes precedence over managed** — users with existing global installs see no change; no shadow install.
- **Session reload after upgrade** reuses existing pi-core update broadcast (§11).

## 16. Open items for implementer

1. **Extension packaging (§5)**: add `@blackbelt-technology/pi-dashboard-extension` as runtime dep of pi-dashboard-server, OR publish a meta-package. Decide before task 2.
2. **Queue semantics (§3)**: session-spawn queue — persist in memory or in `~/.pi/dashboard/bootstrap-queue.json`? If dashboard crashes during install, do queued requests survive? Recommend in-memory; document as known limitation.
3. **`bootstrap-install.ts` location**: `packages/shared/src/` or `packages/server/src/`? Shared if Electron still calls directly; server if Electron calls server API. Recommend shared — Electron wizard needs to call before server is up.
4. **Default `piCompatibility` range**: what versions of pi-coding-agent does the current dashboard-server support? Needs answer at implementation time; ship with `minimum: "0.5.0"` as initial guess.
5. **CLI `upgrade-pi` semantics when no dashboard running**: run `bootstrapInstall` directly (current plan) OR refuse with "start dashboard first"? Recommend direct — simpler.
