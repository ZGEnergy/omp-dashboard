# Tasks — embed-git-bash-on-windows

## Spikes (resolve before implementation)

- [x] **R1 spike (on CI)** — `.github/workflows/spike-git-bash.yml`,
  `windows-latest` (x64) + `windows-11-arm` (arm64): download the pinned
  `dugite-native-<assetInfix>-windows-<arch>.tar.gz` (tag `v2.53.0-3`),
  SHA-256 verify fail-closed, extract with Node `tar` (matches what
  `download-git-windows.mjs` will use), probe `git.exe`/`bash.exe`/
  `sh.exe --version`, then **ZIP round-trip** (`Compress-Archive` →
  `Expand-Archive`, the real current Windows distribution path) and
  re-probe; inspect `usr/bin/sh.exe` LinkType. Secondary: NSIS package +
  silent install + re-probe (forward-looking for
  `restore-windows-nsis-installer`). **Block merge if x64/arm64 probes
  or the ZIP round-trip fail.** NOTE: NSIS removed from current build
  (archived `simplify-electron-bootstrap-derived-state`); ZIP round-trip
  is the faithful packaging test.
- [x] **R5 investigation** — Read `packages/extension/src/command-handler.ts`
  (path confirmed current)
  (`!` and `!!` prefix path) on a clean Windows VM without Git for Windows.
  Capture exact failure mode (silent ENOENT, bridge crash, error toast).
  Decides framing in proposal §Why.

## Build pipeline

- [x] Add `packages/electron/scripts/_git-version.json` with
  `dugiteNativeTag` + `sha256.windows-x64` + `sha256.windows-arm64`,
  pinned to a current dugite-native release.
- [x] Create `packages/electron/scripts/download-git-windows.mjs`
  mirroring the `download-node.sh` contract:
  - Reads `_git-version.json`
  - Resolves target arch from `process.env.npm_config_target_arch`
    (already threaded by `bundle-server.mjs`)
  - Fetches the GitHub release tarball via Node `https` (no curl/bash)
  - Streams `tar.x()` into `packages/electron/resources/git/`
  - Verifies SHA-256 fail-closed before extraction
  - Writes `resources/git/THIRD-PARTY-LICENSE.txt` (verbatim git COPYING
    + MSYS2 notices + corresponding-source pointer)
  - Skips entirely if target platform is not `win32`
- [x] Wire `download-git-windows.mjs` into `bundle-server.mjs`:
  call after node-pty GO/NO-GO when target is win32. Reuse existing
  arch detection.
- [x] Add GO/NO-GO assertions to `bundle-server.mjs` for win32 targets:
  `resources/git/cmd/git.exe`, `resources/git/usr/bin/sh.exe`
  (R1 spike: dugite-native ships NO `bash.exe`; the shell is `sh.exe`),
  `resources/git/THIRD-PARTY-LICENSE.txt`. Also assert the arch libdir
  exists (`mingw64` on x64 / `clangarm64` on arm64).
- [x] Update `packages/electron/scripts/assert-runnable-bundle.mjs` to
  cover bundled git presence on win32 bundles.

## Runtime — selection logic

- [x] Add `selectGitSource({ setting, platform, env, fsExists, which })`
  pure helper in `packages/shared/src/platform/select-git-source.ts`
  returning `"host" | "bundled"`. Unit-test the truth table from
  proposal §3.
- [x] Add `ensureBundledGitOnPath(env, opts)` in
  `packages/shared/src/platform/ensure-bundled-git.ts`, sibling to
  `ensure-windows-path.ts`. Idempotent. No-op when
  `selectGitSource() !== "bundled"`.
- [x] Add `resolveBundledGitDir()` helper that finds
  `resources/git/` relative to `process.resourcesPath` (Electron) or
  the packaged server bundle (standalone). Returns `null` when no
  bundle is present (dev tree, non-electron server).

## Runtime — wiring

- [x] Hook `ensureBundledGitOnPath` into the central spawn-env
  chokepoint `ToolResolver.buildSpawnEnv`
  (`packages/shared/src/platform/binary-lookup.ts`), **after** its
  existing `ensureWindowsSystemPath` call. This single hook covers:
  - `packages/shared/src/server-launcher.ts` (server startup env)
  - `packages/server/src/process-manager.ts` (every bridge / headless
    spawn — `buildSpawnEnv` is reached via `resolver.buildSpawnEnv`)
- [x] Separately wire the PTY path, which bypasses `buildSpawnEnv`:
  `packages/server/src/terminal-manager.ts` builds env as
  `{ ...process.env, ...getTerminalEnvHints() }`. Either add an
  `ensureBundledGitOnPath` call there or extend `getTerminalEnvHints`
  in `packages/shared/src/platform/shell.ts`. Required so `!`/`!!`
  bang-prefix commands in the terminal see bundled git/bash.
- [x] Cache `selectGitSource()` result for the life of the server
  process; expose via `getActiveGitSource()` for Diagnostics + Settings
  readout. (`packages/shared/src/platform/git-source.ts`)
- [x] Invalidate cache on `/api/restart` (already a fresh process, so
  free) and on `windowsGitSource` config-write (server doesn't restart
  on every config write today — confirm or trigger restart).

## Config + setting

- [x] Add `windowsGitSource?: "auto" | "host" | "bundled"` to the
  config schema in `packages/shared/src/config.ts`. Default `"auto"`.
- [x] Plumb through `config-api.ts` (read/write/redact paths).
- [x] On config-write of `windowsGitSource`, either restart the server
  or invalidate the `selectGitSource` cache + re-augment env for newly
  spawned children (existing children keep their old PATH — document
  this in the UI as "takes effect for new sessions").

## Settings UI

- [x] Add Windows-only "Git & Bash source" radio group to
  `packages/client/src/components/SettingsPanel.tsx`. Hide on
  non-Windows. Three options: Auto / Host only / Bundled only, with
  descriptive subtext per proposal §3.
- [x] Add live "Currently active: <source> — <path> (v<version>)"
  readout below the radio. Fetches from `/api/health` or a new
  `/api/git-source` endpoint.
- [x] Server endpoint: extend `/api/health` payload with
  `gitSource: { active, setting, path, version, source }` Windows-only
  block.

## Diagnostics

- [x] Extend `runSharedChecks` in
  `packages/shared/src/doctor-core.ts` with `git source` and
  `bash source` rows. Each shows path + version + `(host)` / `(bundled)`.
- [x] Diagnostics surfaces "Switch to host" / "Switch to bundled"
  shortcut buttons that POST the setting change.

## License compliance

- [x] Author `resources/git/THIRD-PARTY-LICENSE.txt` template (verbatim
  Git COPYING, MSYS2/MinGW notice file, OpenSSL/zlib/libidn2/expat
  notices as bundled by dugite-native, corresponding-source pointer
  https://github.com/desktop/dugite-native).
- [x] Add "Bundled software" entry in the Electron About dialog
  (`packages/electron/src/lib/app-menu.ts`) linking to the file when
  bundled git is active.

## CI / tests

- [x] Repo-lint test
  `packages/shared/src/__tests__/no-hardcoded-bundled-git-paths.test.ts`
  forbidding `resources/git/cmd/git.exe` etc. outside the platform/
  resolver helpers (mirrors `no-hardcoded-node-modules-paths.test.ts`).
- [x] Unit tests for `selectGitSource` covering the full truth table
  (proposal §3).
- [x] Unit tests for `ensureBundledGitOnPath` covering: no-op on non-
  Windows; no-op when setting=`host` and host present; PATH prepend
  when setting=`bundled`; PATH prepend when setting=`auto` + host
  missing; idempotence (apply twice = apply once).
- [x] Integration test in `qa/tests/` running on the Windows QA VM:
  uninstall Git for Windows, launch dashboard, run `git status` via a
  prompt, assert it succeeds via bundled git.
- [x] Extend `_electron-build.yml` win32 legs to fail loudly if
  `download-git-windows.mjs` fails or produces an incomplete tree.
  (GO/NO-GO in bundle-server.mjs + GIT_TARGET_ARCH env on Bundle step)

## Documentation

- [x] Add `docs/file-index-electron.md` rows for
  `download-git-windows.mjs`, `_git-version.json`,
  `ensure-bundled-git.ts`, `select-git-source.ts`.
  (electron split + shared split; git-source.ts too)
- [x] Add `docs/architecture.md` "Windows runtime dependencies"
  subsection covering the auto/host/bundled selection model + PATH
  semantics.
- [x] Add `docs/faq.md` entries: "How do I switch between bundled and
  host git on Windows?" and "Why does my installer download include a
  copy of git?"
- [x] Update `AGENTS.md` key-files table with the new helpers (≤200
  chars each, no inline change history per docs policy).
  (routed to docs/file-index-{shared,electron}.md per Documentation
  Update Protocol rule 0 — AGENTS.md must NOT carry per-file rows)
- [x] `CHANGELOG.md` `[Unreleased] → Added`: one-paragraph summary.
