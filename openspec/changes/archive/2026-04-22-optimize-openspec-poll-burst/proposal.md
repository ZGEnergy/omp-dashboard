## Why

The dashboard server currently pins every CPU core to 100% for ~10 seconds every 30 seconds on workstations with many pinned/active directories. Investigation (see design.md) shows the cause is a **synchronous burst spawn** inside `packages/server/src/directory-service.ts#pollAllDirectories`:

- Every `POLL_INTERVAL` (hard-coded 30 000 ms) the server iterates all known directories (pinned + every session's cwd).
- For each directory it calls `pollOpenSpecAsync(cwd)`, which runs `openspec list --json` and then **one parallel `openspec status --change <name> --json` per change**.
- Each `openspec` invocation is a full Node.js CLI startup (~0.3–1.0 s user CPU just to load its module graph).
- In a realistic setup (4 known directories, 63 active non-archived changes) this explodes to **~67 Node child processes launched simultaneously**, consumed via `Promise.all` at two nesting levels with no concurrency cap.
- `scanPiResources(cwd)` runs in the same burst and adds sync `fs.readFileSync` / `fs.readdirSync` pressure.

Two independent pathologies stack:

1. **No change detection** — every tick re-runs the CLI for every change, even when no `openspec/changes/**` file has been modified. In steady state >99 % of the spawns produce bit-identical output.
2. **No spawn throttling** — even when work is genuinely needed, all spawns start on the same microtask tick. Because the dominant cost is Node+openspec startup (CPU-bound JS parse/compile), OS scheduling cannot spread the load: you get a wall of 100 % followed by idle.

The current behavior is observable as rectangular CPU plateaus on every core, perfectly aligned with the 30 s interval, plus a burst of short-lived `node`/`openspec` processes in `top`/Activity Monitor. It becomes severe enough to stall the whole machine on larger repos (e.g. one directory in the reporter's setup has 41 active changes).

The existing spec (`server-openspec-polling`) commits to a **fixed 30 s cadence** and mandates that every directory is polled unconditionally. That wording blocks the optimization, so this change updates the spec rather than silently diverging from it.

## What Changes

User-facing:

- **New advanced setting `openspec.pollIntervalSeconds`** (default 30, min 5, max 3600) surfaced in the Settings panel under a new "Background polling" section.
- **New advanced setting `openspec.maxConcurrentSpawns`** (default 3, min 1, max 16) to cap how many `openspec` CLI invocations may run at once.
- **New advanced setting `openspec.changeDetection`** — `"mtime"` (default) | `"always"`. When `"mtime"`, the server skips re-polling a change whose directory mtime has not advanced since the last successful poll and serves the cached result instead.
- **New advanced setting `openspec.jitterSeconds`** (default 5, min 0, max 60). Each known directory gets a stable per-cwd phase offset in `[0, jitterSeconds)` so polls do not all align on the same tick, flattening the CPU envelope.

Internal (server):

- `packages/shared/src/config.ts` gains an `openspec` block in `DashboardConfig` with the four fields above, validated and clamped in `loadConfig` with safe fallbacks to defaults.
- `packages/server/src/config-api.ts` exposes the block via GET/PUT and round-trips it through the existing partial-merge path.
- `packages/server/src/directory-service.ts` replaces the hard-coded `POLL_INTERVAL = 30_000` with the configured value, reads the config at `startPolling()` time, and reconfigures (not restarts) when config changes.
- `pollAllDirectories()` stops being a monolithic `Promise.all` burst. It becomes a scheduled scan that:
  1. Looks up `mtimeMs` of `<cwd>/openspec/changes` and `<cwd>/openspec/changes/<name>` (cheap `fs.stat`).
  2. Runs `openspec list` only if the top-level mtime changed (or there is no cached list yet).
  3. Runs `openspec status --change <name>` only for changes whose directory mtime is newer than the last poll's recorded mtime for that change, OR which appeared/disappeared since the last list.
  4. Dispatches the remaining CLI invocations through a `p-limit`-style semaphore bounded by `maxConcurrentSpawns`.
  5. Applies a deterministic per-cwd phase offset so directory polls are staggered within the interval.
- The cache (`openspecCache: Map<cwd, OpenSpecData>`) grows a sibling `Map<cwd, PerChangeMtime>` to remember the mtime used for each change's cached status.
- `scanPiResources()` is **not** rewritten in this change, but its invocation is moved off the openspec-poll tick and put on its own lower-frequency scheduler (default 5 × `pollIntervalSeconds`, because pi extensions/skills/prompts change far less often than OpenSpec artifacts). It remains eligible for future async-ification under a follow-up change.
- `refreshOpenSpec(cwd)` and the `openspec_refresh` message handler are preserved as force-refresh paths: they MUST bypass the mtime gate and re-run the CLI unconditionally, so the "refresh" button in the UI always does real work.

Client (settings UI):

- `packages/client/src/components/SettingsPanel.tsx` gets a new collapsible "Background polling" section with four inputs wired to the new config fields. Labels and help text explain the tradeoffs (longer interval → less CPU, slightly staler UI; lower concurrency → smoother curve, slightly longer per-tick duration; mtime detection on → near-zero steady-state cost).

Docs:

- `docs/architecture.md` gains a short "OpenSpec polling cost model" subsection referencing the new config fields.
- `AGENTS.md` key-files table is extended where new files are added (none expected; the work is surgical).
- `README.md` configuration reference lists the new `openspec` block.

NOT in scope (captured as explicit non-goals in design.md):

- Replacing the `openspec` CLI spawn with in-process module import (large, separate change — would eliminate the cost entirely but requires pinning/bundling the openspec package and is orthogonal to "stop burning CPU on unchanged data").
- Converting polling to `fs.watch`-driven eventing (desirable follow-up; out-of-scope here because it has its own cross-platform failure modes — inotify limits on Linux, rename-detection quirks on macOS APFS, recursive-watch on Windows).
- Rewriting `scanPiResources` as async/streaming.
- Changing the bridge-side `GIT_POLL_INTERVAL` / `HEARTBEAT_INTERVAL` / `PROCESS_SCAN_INTERVAL` (those are per-session and not implicated in the observed burst).

## Capabilities

### Modified Capabilities

- `server-openspec-polling`: Interval becomes configurable; polling becomes change-aware (mtime gate); CLI spawns are throttled and jittered.

## Impact

- **Files touched (production)**: `packages/shared/src/config.ts`, `packages/server/src/config-api.ts`, `packages/server/src/directory-service.ts`, `packages/server/src/session-bootstrap.ts` (initial poll still runs once, unchanged), `packages/client/src/components/SettingsPanel.tsx`.
- **Files touched (tests)**: `packages/server/src/__tests__/directory-service.test.ts` (new cases for mtime gate, semaphore, jitter, config override); new `packages/shared/src/__tests__/config-openspec.test.ts` for validation/clamping; `packages/client/src/__tests__/settings-panel.test.tsx` for new UI section.
- **Shared protocol**: no changes. `openspec_update` broadcast shape is identical. `openspec_refresh` semantics are identical (still force-refresh).
- **Dependencies**: no new runtime deps. The semaphore is a ~30-line in-repo helper; no `p-limit` install. (Rationale in design.md.)
- **Backwards compatibility**: Full. A `config.json` with no `openspec` block behaves exactly like today (30 s interval, no mtime gate) **except** that mtime-gate is ON by default — see design.md for why defaulting it ON is safe.
- **Expected steady-state CPU reduction**: from ~67 spawns/30 s to ~0–2 spawns/30 s on a quiet repo; worst case during active editing drops by at least `maxConcurrentSpawns / totalChanges` because work is serialized instead of burst. Measured plateaus should go from ~10 s @ 100 % to sub-second blips.
