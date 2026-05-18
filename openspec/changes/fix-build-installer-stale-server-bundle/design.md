# Design: fix-build-installer-stale-server-bundle

## Context

`packages/electron/scripts/build-installer.sh` orchestrates four cache layers:

| Layer | Output | Today's invalidation gate |
|---|---|---|
| **Bundled server** | `resources/server/` | **Directory existence** (`[ ! -d resources/server/node_modules ]`) ← the bug |
| Bundled Node | `resources/node/` | Per-arch sentinel (`maybe_wipe_arch_caches`) |
| Offline npm cacache | `resources/offline-packages/` | mtime gate (`offline-packages.json -nt manifest.json`) |
| Recommended extensions | `resources/bundled-extensions/` | None — script wipes + rebuilds each run |

Three of four already use content-aware invalidation. The bundled-server
layer is the holdout, and it is the layer that contains all dashboard
server source. Result: editing
`packages/server/src/**`, `packages/shared/src/**`, `packages/client/src/**`,
`packages/extension/src/**`, or `packages/dashboard-plugin-runtime/src/**`
does NOT invalidate the cache. The next `build:local` ships a stale
`resources/server/` and the developer has no signal that the cache was
served instead of rebuilt.

This was reproduced on 2026-05-17: every Group-16 fix of
`streamline-electron-bootstrap-and-recovery` was in the working tree;
the DMG it produced contained zero of those fixes; the user observed
the pre-fix `404 Not Found` symptom and we lost ~40 minutes to
forensics.

The escape hatch is `npm run clean:resources`, but:
1. There is no signal telling the developer they need it.
2. The cache-hit log line (`✓ Bundled server already present`) is
   indistinguishable from a fresh build's success line.
3. The FAQ mentions it once, in the "How do I build the Electron app
   locally?" entry, buried below the script descriptions.

## Goals / Non-Goals

**Goals:**
- Make `build-installer.sh` detect when `resources/server/` is stale
  relative to its source inputs and re-run `bundle-server.mjs`
  automatically.
- Emit a single, grep-friendly log line per cache decision so a
  developer can audit "did the bundler run this build?" from CI logs.
- Cost-bounded: the staleness check itself MUST be sub-100 ms on warm
  cache (a `find -newer` walk over five small workspace source trees).
- Pin the contract with a regression test so a future edit to the gate
  cannot silently re-introduce dir-only invalidation.

**Non-Goals:**
- Incremental copy inside `bundle-server.mjs`. The bundler is already
  fast (~5 s on a clean macOS host). The gate is the bug, not the
  bundler.
- Touching the parallel offline-packages / recommended-extensions
  caches. Both already invalidate correctly today.
- A reactive watch-mode (`build-installer.sh --watch`). Out of scope;
  the local dev loop is fine with explicit invocations once the gate
  is correct.
- Cross-platform compatibility audit. The script is bash-only and runs
  in Docker (Linux) / macOS / `git-bash` (Windows). All three have
  POSIX `find -newer`. No Windows-PowerShell variant exists or is
  proposed.
- Adding a `--force` flag. `clean:resources` already covers this case;
  another flag is API surface for the sake of it.

## Decisions

### D1. Stamp file vs. plain mtime comparison
Two viable approaches:

- **(A) Bundle stamp.** Write `resources/server/.bundle-stamp` JSON
  after every successful bundle: `{builtAt, srcMtime, bundlerMtime}`.
  Re-bundle when the stamp is missing, or when any tracked file's
  current mtime is greater than the stamp's `srcMtime`.

- **(B) Touch a sentinel.** Touch `resources/server/.last-built` after
  every successful bundle. Re-bundle when source is newer than the
  sentinel.

**Chosen: A.** Two reasons:
1. The stamp carries the *bundler's* own mtime, so editing
   `bundle-server.mjs` itself triggers a re-bundle. Approach B would
   miss that case (the bundler's mtime can be older than the sentinel
   if you edit the bundler without touching any workspace source).
2. The stamp gives us a human-readable timestamp (`builtAt`) in the
   log line for free, which doubles as the "did the bundler actually
   run today?" audit signal.

The stamp is JSON, written via `node -e` (since bash + JSON is
unergonomic), or via a tiny helper at
`packages/electron/scripts/_bundle-stamp.mjs`. Lean toward inline
`node -e` to keep the change surface minimal.

### D2. Which source roots count as "tracked"
The bundle script copies these five workspace dirs:
```
packages/server
packages/shared
packages/client
packages/extension
packages/dashboard-plugin-runtime
```
Plus the bundler itself (`packages/electron/scripts/bundle-server.mjs`).
The staleness check tracks exactly those six paths. It does NOT track
`packages/electron/src/` (Forge handles those; they're the main-process
code, not the dashboard server). It does NOT track `node_modules/`
(npm install runs inside the bundle dir, so its outputs ARE the cache,
not its inputs).

Recursive `find` is scoped to `src/` subdirs of each workspace
(`packages/<short>/src`) to skip `node_modules`, `dist`, build
artifacts, and the bundle's own `packages.d/` shadow dir.

### D3. Staleness detection in pure bash
`find <roots> -type f -newer "$stamp" -print -quit` returns non-empty
on first newer file found. Cheap: stops on first hit. Cross-platform
POSIX. Sub-100 ms on our trees.

When the stamp is missing entirely, treat as stale (forces a rebuild
on first run after `clean:resources`).

When `bundle-server.mjs` is newer than `srcMtime` recorded in the
stamp, treat as stale. (This is a separate `find -newer` check
against a different stored mtime.)

### D4. Log line format
Replace today's silent gate with one of three lines, each
grep-friendly:

```
↻ Bundled server stale (reason=stamp-missing) — re-bundling
↻ Bundled server stale (reason=source-newer file=packages/server/src/server.ts) — re-bundling
↻ Bundled server stale (reason=bundler-newer) — re-bundling
✓ Bundled server cache hit (built 4m ago, stamp matches)
```

The `reason=` token is machine-readable; the trailing prose is for
humans. `file=` lists the *first* newer file (find -quit). This is
enough for diagnosis; if multiple files are stale the next build run
shows the same "re-bundling fires" outcome, so the field doesn't need
to enumerate.

### D5. Regression test
The contract under test:

> Given a clean `resources/server/` produced by `build-installer.sh`,
> if I touch any tracked source file AND run the relevant gate logic,
> it MUST report stale.

Two options for the test harness:

- **Bash test under `packages/electron/scripts/__tests__/`.** Pure
  shell, runs the gate logic in isolation. Pro: no test-framework
  bridge. Con: bash testing harness is hand-rolled.
- **Vitest in `packages/electron/src/__tests__/`** invoking the gate
  via `execFileSync`. Pro: integrates with existing test runner +
  CI matrix. Con: requires the gate to be testable without `make` /
  `electron-forge` actually running.

**Chosen: vitest.** The gate logic gets extracted into a small bash
function (or `node -e` block) callable in isolation with the
relevant env vars; the test plants source files in a tmp dir,
invokes the function, and asserts the exit/stdout. Two existing
scripts already use this pattern: `packages/electron/src/__tests__/preflight-reconcile.test.ts`
(node-side I/O harness) and the no-direct-* lint tests.

### D6. FAQ + AGENTS.md promotion
The "How do I build the Electron app locally?" FAQ entry gains:

> **Source edited but DMG ships stale code?** The bundle gate now
> auto-detects source mtimes since last build (see `build-installer.sh
> :get_bundled_server_staleness`). If for any reason auto-detection
> fails (clock drift, NTP jumps, fs without nsec mtimes), force a
> full rebuild with `npm run clean:resources`.

AGENTS.md `build-installer.sh` row (under
`docs/file-index-electron.md`, not AGENTS.md per the file-index
delegation rule) gains a note that the script now writes
`resources/server/.bundle-stamp` and detects staleness via that file.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `find -newer` mtime comparison breaks on clock skew (e.g. dev edits a file, then NTP rolls the clock back by 2 minutes — file mtime now in the future relative to a fresh `builtAt`, so a re-bundle thinks it's already-current). | `clean:resources` still works as the universal escape hatch. The FAQ entry calls this out. We could also probe `now() < stamp.builtAt` and treat that as "stale by clock skew" to force re-bundle, but the added complexity isn't justified for an edge case. |
| `find` over the workspace trees finds editor swap files (`.foo.swp`, `~`, `.#foo`) and triggers spurious re-bundles. | Track only `*.ts`, `*.tsx`, `*.js`, `*.mjs`, `*.cjs`, `*.json`, `*.html`, `*.css`, `*.svg` extensions via `-name`. Editor temp files are skipped. |
| The stamp file lands inside `resources/server/`, which gets packaged into the `.app`. Now end-users see a `.bundle-stamp` in the shipped bundle. | Add the stamp to the bundle's strip walk (it already removes `*.md`, `*.map`, `CHANGELOG*`, etc.). Or place the stamp outside `resources/server/` (e.g. `packages/electron/.bundle-stamp` at the repo root, gitignored). The latter is cleaner. |
| Adding bash logic to `build-installer.sh` increases the maintenance footprint of an already-300-line shell script. | Keep the gate logic to a single helper function (~20 lines). Extract to `_bundle-stamp.mjs` only if it grows past that. |
| Regression test brittleness on filesystems without nsec-precision mtimes (some Docker volume mounts, older ext4). | Use `-newer` (compares to the second by default on macOS / BSD `find`; nsec on Linux GNU `find`). Within-second-precision wins are fine; sub-second edits aren't a realistic dev scenario. |
| The `reason=source-newer file=...` log line leaks one filename into CI logs. | Harmless; the workspace dir layout is already public via the repo. |

## Open Questions

None of these block implementation; flagging for the implementer.

- Should `.bundle-stamp` be inside `resources/server/` (current bias) or
  at `packages/electron/.bundle-stamp` (cleaner)? Bias: outside, gitignored.
- Do we want a `BUILD_DEBUG=1` env that prints `find -newer` output for
  every tracked file (not just the first)? Probably no — `clean:resources`
  is the standard debug path.
- Should this same gate apply to the offline-packages stale-pin check at
  `build-installer.sh:314`? No — that one already works; touching it
  is out of scope per Non-Goals.
