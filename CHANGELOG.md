# Changelog

All notable changes to **pi-agent-dashboard** are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the release workflow (including how `Unreleased` becomes a versioned section),
see [`docs/release-process.md`](docs/release-process.md).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.4.1] - 2026-04-27
### Added
- **Build-time tool registry coverage for `electron` and `node-pty`.** Both packages are now registered in the dashboard's `ToolRegistry` (`override` → `bare-import` → optional `managed` strategy chain), and a new shell-callable resolver wrapper at `packages/shared/bin/pi-dashboard-resolve-tool.cjs` exposes registry resolution to CI workflows and Dockerfiles without requiring the shared package's TS build. CI's linux/arm64 electron rebuild step (`publish.yml`) and the cross-platform Docker electron rebuild step (`Dockerfile.build`) both now go through the wrapper, so npm workspace hoisting changes can no longer break releases (this was the root cause of the v0.4.0 release crisis). See change: `register-build-time-tools`.

### Changed
- **Root postinstall (`scripts/fix-pty-permissions.cjs`) is now hoist-aware.** Replaces the hardcoded `node_modules/node-pty/prebuilds` path with `require.resolve("node-pty/package.json")`, mirroring the registry's `bare-import` strategy. Previously failed silently on every fresh install of the root workspace, leaving `node-pty`'s `spawn-helper` without execute permission and producing `posix_spawnp failed` at terminal-spawn time. See change: `register-build-time-tools`.

### Fixed
- **Per-message Fork (⤘) now includes the clicked message in the new session.** Previously, clicking the per-message Fork button on either a user or assistant chat bubble produced a forked session whose history ended one entry BEFORE the bubble that was clicked. Root cause: pi 0.69+ awaits extension handlers BEFORE running `sessionManager.appendMessage`, so the bridge's `queueMicrotask`-based deferral resolved inside the awaited dispatcher and read the *previous* leaf via `getLeafId()`. The dashboard pins `pi >= 0.70.0`, so this affected every supported pi version. Fix: bridge now (1) stamps a `nonce` on `message_start`/`message_end` events instead of relying on `getLeafId()` for live emissions, (2) defers the `message_end` send via `setTimeout(0)` (macrotask) so pi has time to mutate `event.message.id` in place and the wrapped `appendMessage` to record the id, (3) emits a new `entry_persisted { entryId, nonce }` event after each successful append so the client reducer can back-fill the user-message bubble's `entryId`. The fork pipeline (`createBranchedSessionFile` + `pi --fork`) is unchanged — once the entry id is correct, it works. Tests: `packages/extension/src/__tests__/bridge-entry-id-pi-070.test.ts`, `packages/server/src/__tests__/fork-jsonl-roundtrip.test.ts`, `packages/shared/src/__tests__/state-replay-entry-id.test.ts`. See change: `fix-per-message-fork`.
- **New repo-level lint test prevents reintroduction of hardcoded `node_modules/<dep>` paths.** `packages/shared/src/__tests__/no-hardcoded-node-modules-paths.test.ts` scans the migrated build-time files for `node_modules/electron` and `node_modules/node-pty` substrings and fails `npm test` with a `file:line:col` citation. Mirrors the existing `no-direct-process-kill.test.ts` / `no-raw-node-import.test.ts` lint pattern. See change: `register-build-time-tools`.

## [0.4.0] - 2026-04-24

### Added
- **Per-session chat input drafts + bash-style history recall.** In-progress chat text is now preserved per session when you navigate away from the chat view (Settings, OpenSpec previews, file diffs, pi-resources) and survives across dashboard reloads via `localStorage`. Switching sessions cleanly isolates drafts so text no longer leaks from one session into another. Within a session, `ArrowUp` / `ArrowDown` walks your previously sent prompts (newest first, consecutive duplicates collapsed) — press `Escape` mid-history to restore your in-progress draft. See change: `chat-input-draft-and-history`.
- **Hot-reload for custom LLM providers + "Test" button.** Adding, editing, or removing a provider in **Settings → Providers** now takes effect immediately across every running pi session — no reload needed. The new **Test** button sends a probe request to the configured endpoint and surfaces HTTP status + response preview so misconfigured keys / URLs are obvious before you try to chat. Previously the bridge only read `providers.json` once at startup, so new providers stayed invisible until a full session restart. See change: `hot-reload-custom-providers`.
- **Single-dashboard-per-HOME advisory lock.** Two `pi-dashboard` processes sharing the same `HOME` directory would race on `~/.pi/agent/settings.json`, `.meta.json` files, PID registries, and Zrok tunnel reservations — occasionally corrupting state or SIGTERM-ing each other's child processes. A new per-HOME advisory lock detects a running sibling and hands off cleanly (via discovery + attach) instead of starting a second conflicting instance. See change: `single-dashboard-per-home`.

### Changed
- **Dashboard `/reload` now works for headless pi sessions.** Previously the bridge extension could only trigger `session.reload()` after a human had invoked `/__dashboard_reload` once in pi's TUI — making it unreachable on headless-spawned sessions. The dashboard now kills the old process and respawns it with `pi --session <file>`, producing the same observable effect (same `sessionId`, same entries) without requiring TUI interaction. `npm run reload` and the dashboard reload button now work uniformly across TUI and headless sessions. See change: `headless-reload-via-respawn`.

### Fixed
- **Trusted-network dashboard access works again without OAuth configured.** After the earlier `consolidate-trusted-networks` change repointed the Settings UI from `config.trustedNetworks` to `config.auth.bypassHosts`, users without an OAuth provider lost remote LAN access: entries added via the UI were silently dropped on save, hand-written entries were ignored at load, and the WebSocket upgrade guard kept blocking even after a save succeeded. Three bugs fixed together (UI-save persistence, config-load gate, runtime guard refresh) so adding a trusted network via the Settings UI now takes effect immediately without a server restart or an OAuth provider. See change: `fix-trusted-networks-no-oauth`.

### Performance
- **OpenSpec polling no longer pegs every CPU core every 30 seconds.** Polling across many pinned directories previously spawned dozens of `openspec` child processes simultaneously (one per change, per directory, per tick) — producing ~10-second 100% CPU bursts on workstations with many active changes. Polling now uses per-directory `mtime`-gated change detection (skips unchanged trees entirely), a shared concurrency semaphore (max N parallel spawns across all directories), and deterministic per-directory jitter to spread the work. Configurable via new `openspec.*` keys in `~/.pi/dashboard/config.json` (`pollIntervalSeconds`, `maxConcurrentSpawns`, `changeDetection`, `jitterSeconds`). Zero functional change; same poll results, orders-of-magnitude less CPU. See change: `optimize-openspec-poll-burst`.

### Fixed
- **`pi-dashboard start` and auto-start no longer crash with `ERR_UNSUPPORTED_ESM_URL_SCHEME` when the dashboard source lives on a non-C: Windows drive** (e.g. `B:\Dev\pi-agent-dashboard`). Previously the `fix-windows-server-parity` change wrapped only the `--import <loader>` argument as a `file://` URL; the entry-script argument (`<cli.ts>` position) was still passed as a raw Windows path. Node's ESM loader parses both positions as URLs, and its drive-letter heuristic has gaps on `A:`, `B:`, and other less-common drive letters, causing Node to interpret the drive letter as a URL scheme (e.g. `b:`) and reject it. All four server-spawn call sites (`packages/server/src/cli.ts`, `packages/extension/src/server-launcher.ts`, `packages/electron/src/lib/server-lifecycle.ts`, `packages/server/src/restart-helper.ts`) now route through a new `spawnNodeScript` helper / `toFileUrl` wrapper in `packages/shared/src/platform/node-spawn.ts` that URL-wraps both the loader and entry positions unconditionally. A repo-level lint test (`no-raw-node-import.test.ts`) prevents future spawn sites from regressing. See change: `fix-windows-entry-script-url`.
- **Custom-provider models now register with accurate `contextWindow`, `maxTokens`, `reasoning`, and `cost`** sourced from pi's model registry via `modelRegistry.find()` (captured from `ctx.modelRegistry` at the first `session_start` event). Previously every discovered model was hardcoded to 200k context / 16k maxTokens / no reasoning / `$0` cost — silently wrong for every proxied frontier model. E.g., `proxy/cc/claude-opus-4-7` now correctly reports its 1M context window instead of 200k, surfaces the thinking-level UI (reasoning capable), and tracks cost against Anthropic's Opus 4.7 pricing. Common proxy prefixes (`cc/`, `anthropic/`, `openrouter/openai/…`) are stripped before lookup so prefixed ids resolve to the same registry entry as the bare id. When the registry is unreachable or has no match, api-appropriate fallbacks apply (`anthropic-messages` → 200k/64k, `google-generative-ai` → 1M/65k, `openai-completions` → 128k/16k) — all keeping `input: ["text","image"]` so the image-capable-by-default behavior is preserved. The `session_start` handler also re-invokes `pi.setModel(refreshed)` for the currently-selected model after re-registration, so pi's internal `supportsThinking()` check sees `reasoning: true` instead of the pre-enrichment snapshot. Zero new dependencies; zero `providers.json` schema changes; zero impact on built-in / OAuth providers. See change: `enrich-custom-provider-model-metadata`.
- **Thinking level selector stays in sync across UI surfaces.** Previously clicking a thinking level in the bottom StatusBar updated the session card but not the StatusBar itself (which snapped back to `off`), because the server's `session_updated` broadcast only patched the `sessions` Map while the StatusBar reads `sessionStates[id].thinkingLevel` first. The client-side `session_updated` handler now mirrors `thinkingLevel` / `model` fields into `sessionStates` as well, so both surfaces update together. See change: `enrich-custom-provider-model-metadata`.

### Changed
- **Custom-provider models discovered via `~/.pi/agent/providers.json` now advertise image input capability by default**, so pasted images reach the upstream model instead of being stripped client-side by pi-ai's `downgradeUnsupportedImages`. Vision-capable models (Claude Opus 4.x, GPT-4o, Gemini 2+, OpenRouter multimodals) handle images correctly out of the box. Modern text-only models (GLM, MiniMax, etc.) return a polite "no image visible" reply; legacy text-only models (gpt-3.5-turbo, vanilla gpt-4) surface the upstream 400 error. Built-in / OAuth providers are unchanged — their capabilities still come from pi-ai's `models.generated.js`. See change: `enable-image-input-custom-providers`.

### Added
- **Auto-install pi on first `pi-dashboard` run** (degraded-mode first-run).
  When the server starts and `ToolRegistry.resolve("pi")` fails, it now flips
  `bootstrapState` to `installing`, runs a background `bootstrapInstall` into
  `~/.pi-dashboard/` (extracted from the Electron installer into the shared
  `@blackbelt-technology/pi-dashboard-shared/bootstrap-install.js` module),
  auto-registers the bridge extension on completion, and flips state back to
  `ready`. The UI renders a new `BootstrapBanner` above the main layout
  (`Installing pi…` while in progress, `pi install failed — [Retry]` on error,
  upgrade hints when the resolved pi version is below the compatibility
  range declared in `packages/server/package.json` `piCompatibility`). New
  `pi-dashboard upgrade-pi` subcommand upgrades `@mariozechner/pi-coding-agent`
  via the same shared installer, delegating to a running dashboard when
  present. Session spawn is queued during installs via the new
  `bootstrap-queue` (runs once status flips to `ready`); `/api/pi-core/*`,
  `/api/pi-resources`, and `POST /api/bootstrap/upgrade-pi` all 503/202 as
  appropriate. Extension is shipped as a runtime dep of
  `pi-dashboard-server` so `findBundledExtension` resolves it via
  `require.resolve` when installed via `npm i -g pi-dashboard`. See change:
  `unified-bootstrap-install`.

- **Bootstrap resolution harness** — in-memory (memfs-backed) test harness
  for the dashboard's bootstrap resolution: `ToolRegistry` strategy chains
  + bridge-extension registration across install mechanics, platforms, and
  HOME/path drift. Fail-closed scenario cube (3 platforms × 5 dash-locations
  × 6 pi-states × 4 settings-states × 3 env-states = 1080 cells) enforces
  that every new combination is either tested or explicitly skipped with a
  reason. Captures the current Windows `npm i -g pi-dashboard` bug (B1) as a
  trail snapshot so the fix in `unified-bootstrap-install` will flip visibly.
  Run via `npm run test:bootstrap`. No runtime behavior change; purely a
  regression-prevention layer. Prerequisites: `StrategyDeps` gains
  `resolveModule(id, from)` injector, `managed-paths.ts` exports
  `getManagedDir`/`getManagedBin` getters alongside existing constants,
  `ToolRegistry` accepts an optional `PlatformEnv` context,
  `registerBridgeExtension` accepts `{ homedir }` override — all
  backwards-compatible. See change: `bootstrap-resolution-harness`.

- **Offline first-run install for the Electron app** (opt-in). Release Electron builds now bundle a per-platform npm cacache containing pinned versions of `pi-coding-agent`, `openspec`, and `tsx` (plus all transitive dependencies) inside `resources/offline-packages/` — ~50 MB gzipped per installer. On first launch, the wizard extracts the tarball to `~/.pi-dashboard/.offline-cache/`, verifies its SHA-256 against the embedded manifest, runs ONE `npm install --offline`, then deletes the cache to reclaim ~140 MB. No network access is required. On SHA-256 mismatch or any cache-install failure the wizard aborts — there is **no silent fallback to `registry.npmjs.org`** (deterministic offline contract). When the bundle is absent (dev builds, opt-in flag off) the previous per-package registry install flow runs unchanged. New Doctor row "Offline packages bundle" shows target platform, pinned versions, and SHA-256 prefix. Gated on `BUNDLE_OFFLINE_PACKAGES=1` in CI; pins live in `packages/electron/offline-packages.json`. See change: `electron-offline-bundled-packages`.
- **Bundled first-party extensions in the Electron installer** (opt-in). A new `BUNDLED_EXTENSION_IDS` manifest in `@blackbelt-technology/pi-dashboard-shared` drives a build-time bundler (`packages/electron/scripts/bundle-recommended-extensions.sh`, gated by `BUNDLE_RECOMMENDED_EXTENSIONS=1`) that clones each listed extension into `packages/electron/resources/bundled-extensions/<id>/` with SPDX-license and 15 MB size-budget enforcement. At first launch, `installBundledExtensions()` copies each bundled tree into pi's git cache (`~/.pi/agent/git/<host>/<path>/`), runs `npm install --omit=dev` if needed, and registers the original git URL in `~/.pi/agent/settings.json` so pi's later `update()` can re-resolve upstream. The wizard renders distinct "Bundled ✓" / "Installed" badges. Release CI (`publish.yml`) runs the bundler before `bundle-server.sh` on macOS, Linux, and Windows runners and emits a per-platform size breakdown to the workflow summary. First-party scope: currently `pi-anthropic-messages` (and `pi-flows` once its repo adds a SPDX-conformant license). See change: `bundle-first-party-extensions`.
- **Windows cross-platform parity** — fresh-install dashboard now
  starts and runs correctly on Windows 10/11. Adds `netstat`/`taskkill`
  equivalents for every Unix-only `lsof`/`kill` path: `cli.ts`,
  `/api/restart`, `pi-dashboard stop`, terminal X button, tunnel
  cleanup, and headless-session tree-kill all route through shared
  `platform/process` helpers that select the correct per-OS strategy.
- **`packages/shared/src/platform/` primitive module** — single source
  for cross-OS behavior. `binary-lookup` (`where`/`which` + `.cmd`
  extension + login-shell fallback), `process` (findPortHolders,
  killProcess, killPidWithGroup, isProcessAlive), `process-scan`
  (pgrep vs tasklist), `shell` (COMSPEC vs SHELL), `commands`
  (openBrowser, isVirtualMachine), `paths` (OS-aware normalization +
  multi-drive invariants), `exec`/`runner` (subprocess execution with
  `windowsHide:true` baked in). Every helper takes optional
  `platform: NodeJS.Platform` injection so tests exercise both branches
  without mutating `process.platform`. Enforced by three lint-style
  tests: `no-direct-child-process`, `no-direct-process-kill`,
  `no-direct-platform-branch`.
- **`ToolRegistry` binary + module resolution** — single-source resolver
  for every external binary/module (pi, pi-coding-agent, openspec, npm,
  node, tsx, git, zrok, pi-dashboard). Ordered strategy chain per tool
  (override → bare-import → managed → npm-global → where), per-resolution
  diagnostic trail, in-memory cache, override-aware. REST API at
  `/api/tools*` with a new **Settings → Tools** section for inspecting
  resolution trails, setting overrides, and exporting diagnostics.
- **Node version preflight (`node-guard`)** — server refuses to start
  on Node versions affected by nodejs/node#58515
  (v22.0-v22.17 + v24.1-v24.2) with a clear upgrade message. Bumps
  `engines.node` to `>=22.18.0`.
- **Bridge extension polish** — server-readiness wait now blocks
  indefinitely with child-exit detection (no arbitrary timeout); launch
  progress renders via `pi-tui` Loader widget; spawn failures surface
  as `spawn_error` browser messages with the log path.
- **WSL-tmux probe cache** — per-server-lifetime cache eliminates the
  per-spawn cost of detecting the WSL tmux wrapper.

### Changed
- **Electron doctor/dependency-detector** migrated to `ToolRegistry`
  (drops direct `where`/`which` shelling out). `loadPiPackageManager()`
  now delegates module resolution to `ToolRegistry.resolveModule`.
- **PathPicker** uses OS-aware separator (`withTrailingSep`) and
  `parsePathInput` so Windows drive-letters (`B:`) are handled as
  drive roots, not cwd-relative paths.
- **`spawnDetached`** gained an explicit `detach?: boolean` option
  (default `true`). pi-session spawns now pass `detach:false` so the
  child is tied to the parent's libuv Job Object — no cmd.exe console
  flash on Windows and the child terminates when the parent exits.
- **`useWindowsRedirect` gate** tightened to require
  `stdinMode === "ignore"`; libuv only honors `CREATE_NO_WINDOW` when
  every stdio handle is ignored, and a piped stdin would otherwise
  allocate a visible console.

### Fixed
- **`npm install @blackbelt-technology/pi-agent-dashboard` now works in a
  fresh environment.** The 0.3.0 release on npm was unresolvable: the root
  tarball declared three workspace sub-packages as `dependencies`
  (`pi-dashboard-extension`, `pi-dashboard-server`, `pi-dashboard-web`), but
  those packages were never published to the registry because
  `.github/workflows/publish.yml` ran `npm publish` without `--workspaces`.
  Any clean-environment `npm install` — including `pi install
  npm:@blackbelt-technology/pi-agent-dashboard` — failed with E404 on the
  sub-dependencies. This release publishes the complete runtime package set
  (`root`, `-shared`, `-extension`, `-server`, `-web`) in lockstep, with
  inter-package dependency specifiers synchronised to the current version
  by a new `scripts/sync-versions.js` helper that runs between the version
  bump and the publish step. `packages/electron` remains `"private": true`
  and continues to ship as native installers (DMG/DEB/AppImage/EXE)
  attached to the GitHub Release, not via npm.
- **Bridge auto-registration path math** was off by one — fresh
  installs silently failed to register the dashboard bridge in pi's
  `~/.pi/agent/settings.json` because `baseDir` resolved to
  `<repo>/packages/` instead of `<repo>/`. Fix uses three `..` instead
  of two; adds success/failure log lines so future regressions surface
  loudly.
- **Extension server CLI resolution** in installed npm layouts —
  `resolveServerCliPath()` used sibling-path arithmetic that produced
  `@blackbelt-technology/server/src/cli.ts` (missing the
  `-dashboard-server` suffix) in the installed tree. Now uses
  `require.resolve('@blackbelt-technology/pi-dashboard-server/...')`
  which works in both monorepo and installed layouts.
- **Client directory resolution** in installed layouts — the server
  returned "No client build found" on installed packages because
  `clientSearchPaths[0]` used nested-`node_modules` arithmetic.
  Prepended a `require.resolve` path that works regardless of hoist.
- **Terminal X button on Windows** — now routes kill through
  `taskkill /F /T` with fallback cleanup so the whole process tree
  terminates.
- **Zrok scavenge on Unix** — `scavengeOrphanZrokProcesses` now kills
  the full process group (negative PID) so zrok's worker children
  die with it; Windows path unchanged (taskkill `/T` already tree-kills).
- **node-pty permissions in bundles** — hoist-aware permissions fix
  lands on all packaged Electron bundles (DMG / AppImage / NSIS).

### Deprecated
- **Direct `node:child_process` imports and `process.kill` calls**
  outside the `platform/` module are now architecturally forbidden
  (enforced by lint-style tests). Migrate to
  `@blackbelt-technology/pi-dashboard-shared/platform/exec` and
  `.../platform/process` respectively, or mark legitimate opt-outs
  with `// ban:child_process-ok` / `// platform-branch-ok`.

## [0.3.0] - 2026-04-20

### Added
- **LandingPage onboarding** — empty-state main pane renders three
  guided steps (① Setup credentials → ② Add folder → ③ Start session)
  with live state; each step collapses to a compact ✔ row once
  satisfied so returning users see a status strip rather than a wall
  of onboarding. Credentials detection consults both `/api/providers`
  (baseUrl + apiKey config) and `/api/provider-auth/status` (pi OAuth
  / auth.json), so OAuth-only setups count.
- **OpenSpec session-card lifecycle UI** — the attached-change row
  now shows an explicit `ChangeState` pill (PLANNING / READY /
  IMPLEMENTING / COMPLETE), a `Tasks N/M` button that opens a popover
  for toggling individual `tasks.md` checkboxes (with
  optimistic-concurrency line tokens), and an overflow `⋯` menu with
  **Archive anyway** for when artifacts are authored but
  manual-verification tasks remain unchecked. Bulk Archive moved to
  unattached sessions only.
- **Recommended extensions** — new *Packages* tab surfaces a curated
  set of pi extensions (`pi-anthropic-messages`, `pi-subagents`,
  `pi-flows`, `pi-web-access`, `pi-agent-browser`) with
  install/uninstall actions and live npm/GitHub enrichment. Missing
  *required* extensions trigger a top-of-page banner. The first-run
  wizard gained a matching step with already-installed entries greyed
  out.
- **Pi core version checker + updater** — header badge counts
  available updates for pi ecosystem core packages (pi, pi-dashboard,
  pi-model-proxy, …). A *Packages* settings section lists current →
  latest with per-package and "Update All" actions, live progress,
  and automatic session reload on success.
- **`ask_user` batch method** — new `{method: "batch", title,
  questions: [...]}` shape asks multiple related questions in one
  dialog; sequential execution via existing `ctx.ui.*` primitives,
  mid-batch cancellation returns partial results with
  `cancelled: true`. Forgiving argument coercion handles common LLM
  drift shapes (stringified `questions`, `input_type` wrapper
  flattening, `{label, value}` options, `header` / `question` →
  `title`). Backward compatible — existing single-method shapes
  unchanged.
- **Image paste in the OpenSpec explore dialog** — drop or paste
  screenshots directly into the explore prompt, matching the main
  command input (shared `useImagePaste` hook and `ImagePreviewStrip`
  component).
- **Error banner** — long LLM errors collapse to a summary line with
  *Retry* and *Copy* buttons; full detail expands on demand.
- **Model selector** — provider filter and multi-token typeahead
  search in the model picker; the same `ModelSelector` component now
  drives the default-model setting in *Settings*.
- **Anthropic payload transform extension** for the main session,
  delegating the transform to the shared `@pi/anthropic-messages`
  package.
- **Persistent editor PID registry** — spawned `code-server`
  processes are recorded to `~/.pi/dashboard/editor-pids.json`. On
  server boot, orphans from prior non-graceful exits (SIGKILL, crash,
  OOM, force-quit) are detected via cmdline ownership check and
  terminated (SIGTERM → 1 s grace → SIGKILL), freeing their bound
  port and `--user-data-dir` lockfile so next-click editor spawns
  don't collide.
- **Public marketing site** at `/site` (Astro + Tailwind + MDX +
  Preact), deployed to GitHub Pages via
  `.github/workflows/deploy-site.yml` with a 50 KB gzipped JS budget
  enforced in CI.
- **Cross-platform QA VMs** — new `qa/` Packer-based harness for
  Ubuntu / Windows / macOS base images plus clone → boot → test →
  destroy lifecycle scripts (`make build-*`, `make test-*`,
  `make manual-*`) to verify clean-state installation and runtime
  across platforms from a single command.

### Changed
- **Provider auth flow** — saving credentials now broadcasts
  `credentials_updated` to all sessions, refreshes the model
  registry, and pushes updated models to every connected client; the
  model selector updates in place with no manual reload. The OAuth
  device flow replaced its auto-popup with an explicit button so the
  browser no longer blocks it.
- **Path picker** — directory filtering moved server-side via a new
  `q` query param on `GET /api/browse` with 4-tier ranking
  (exact > prefix > word-boundary > substring), applied *before* the
  200-entry cap so best matches always survive. Client input is
  debounced with in-flight cancellation. Enter follows a strict state
  machine (exact > unique prefix > highlighted row), and a new
  `POST /api/browse/mkdir` endpoint creates folders inline.
- **Bundle size + HTTP compression** — web client is manually split
  into vendor chunks (React, markdown, syntax-highlighter,
  git-diff-view, xterm, dnd-kit, utilities), dropping the main chunk
  from 3.1 MB to ~570 KB (~150 KB gzipped). Fastify now compresses
  responses through `@fastify/compress` (gzip + deflate, 1 KB
  threshold); Brotli is intentionally disabled because the zrok free
  proxy stream-resets `content-encoding: br` responses under parallel
  browser load.
- **Sidebar brand mark** — the literal `π` glyph is replaced by an
  inline-SVG `PiLogo` component (`fill="currentColor"`, transparent
  background) that inherits theme colors. Applied to both
  `SessionList` (desktop) and `SessionSidebar` (alternate).
- **"Working" session indicator** — cards in the working state now
  render an animated diagonal barber-pole stripe alongside the
  existing opacity pulse, making working vs. waiting-on-user
  unambiguous at a glance. `prefers-reduced-motion` disables the
  animation but keeps the static stripes as a state cue.
- **Pin-folder button** — now reads `📌 Add folder` (tooltip: "Pin a
  folder to the sidebar") instead of the icon-only `📌+`.
- **Folder action bar** — removed the deprecated *+Terminal*
  quick-create button; use the *Terminals* tab instead.
- **File search** — replaced the `fd` binary dependency with a
  native Node.js directory walk, removing a platform-specific binary
  and simplifying Windows / portable packaging.

### Fixed
- **Test suite green baseline + jsdom unhandled errors** — restored a zero-failure `npm test` baseline (38 failing tests → 0; 2143 passed, 8 documented `.skip`s carrying `TODO(fix-failing-tests-followup)` markers). Fixes span assertion drift (auto-attach, PiResourcesView, SessionList, config, SessionCard), environment drift (git `master` → `main`, `os.homedir()` browse fixtures), component selectors (PinDirectoryDialog), and timing-flake skips in auto-shutdown / ws-ping-pong / session-lifecycle-logging. Also eliminated three vitest unhandled errors caused by jsdom gaps: `CommandInput` now optional-calls `scrollIntoView?.()`, and `QrCodeDialog` wraps `QRCode.toCanvas(...)` in `Promise.resolve(...).catch(…)` so headless-canvas rejections and `vi.fn()` mocks returning `undefined` no longer surface as "Errors 3".
- **Electron terminal spawn on macOS** — `node-pty`'s `spawn-helper` binary was shipped without execute permission in Electron bundles (npm hoisting skipped the postinstall fix), causing silent `posix_spawnp failed` errors. Added three-layer defense: build-time `chmod +x` + quarantine removal in `bundle-server.sh`, and a runtime permission fix in `createTerminalManager()` as fallback.
- **Zrok tunnel reliability** — eliminated stale
  `https://<token>.share.zrok.io` URLs returning 404 or "bad
  gateway!" caused by reservation leaks across restarts.
  `createTunnel()` is now serialized (concurrent calls share one
  in-flight promise), so UI double-clicks and the startup-auto /
  `/api/tunnel-connect` race no longer spawn parallel `zrok share`
  processes. The reserved-share retry is capped at 1 attempt and
  explicitly releases the old token before reserving a new one; the
  timeout path escalates SIGTERM → SIGKILL after a 2 s grace and
  releases just-in-time-reserved tokens; `POST /api/restart` and
  `POST /api/shutdown` now call `deleteTunnel(config.port)` before
  exit instead of bypassing the graceful-shutdown path; and an
  orphan-process scavenger sweeps any stray
  `zrok share … --override-endpoint http://localhost:<port>` agents
  that escaped pid-file tracking (runs on startup whenever the zrok
  binary is present, even in `--no-tunnel` mode).
- **Browser `ERR_ABORTED 500` on every asset over a zrok tunnel URL**
  — Vite emits `<script type="module" crossorigin>`, which forces
  browsers to request assets in CORS mode even same-origin; the
  server's CORS callback threw on unknown origins and
  `@fastify/cors` surfaced that as HTTP 500. The active tunnel URL
  and any `*.share.zrok.io` host are now auto-allowed, and unknown
  origins return `cb(null, false)` (no CORS headers, no 500) instead
  of throwing. Pre-compressed (`.gz`) sibling files are also now
  generated at build time and served by `@fastify/static` with
  stable `Content-Length` headers, avoiding streaming-compression
  edge cases in intermediate HTTP/2 proxies. (curl kept working
  throughout because it never sent an `Origin` header.)
- **Portable Windows + packaging** — `pi-coding-agent` is now
  resolved from the managed install under
  `~/.pi-dashboard/node_modules/` instead of expecting a system
  install, so portable zips work out of the box. The `node-pty`
  permissions fix is now hoist-aware (works regardless of which
  workspace triggered `npm install`).
- **Prompt templates** — resolved from global skills and installed
  packages in addition to the local project; template names are
  split on any whitespace so multi-line arguments work.
- **Packages UI freshness** — installed-packages list auto-refreshes
  after install / remove / update operations (no more stale counts);
  server now broadcasts `pi_core_update_complete` so the header
  badge refetches and clears.
- **Session fork + replay rendering** — leaf registry fix so forked
  sessions resolve their parent `entryId` correctly; assistant text
  in replay / fork messages now renders instead of showing an empty
  separator.
- **Terminal UX** — new terminal tabs auto-focus when created and
  the UI navigates to the folder view.
- **Miscellaneous** — Roles edit from the dashboard works again;
  `ask_user` argument validation rejects malformed payloads instead
  of silently misbehaving; the browser gateway logs handler errors
  instead of swallowing them.

### Docs
- README updated with Electron standalone install instructions,
  monorepo paths, and new feature callouts.
- OpenSpec proposals added for the dashboard-ux-fixes batch and the
  explore-dialog image-paste change.

## [0.2.0 – 0.2.9] - 2026-04-13 – 2026-04-16

*Initial public releases — installer and cross-platform CI hardening.*

These versions were primarily focused on getting CI to reliably produce
installers across macOS, Linux, and Windows (including arm64). The only
user-visible items worth calling out:

- npm package renamed to `@blackbelt-technology/pi-agent-dashboard` to match
  the GitHub repository (v0.2.1).
- Windows release artifacts now include a ZIP and a portable `.exe` in
  addition to the NSIS installer (v0.2.3).
- arm64 release artifacts added for Linux and Windows (v0.2.6).
- AppImage builds now work on Linux thanks to `libfuse2` in the CI image
  (v0.2.0).
- Docker cross-platform build pipeline added for producing Linux + Windows
  installers from macOS (v0.2.5).

For per-commit detail, see the Git history
(`git log v0.2.0..v0.2.9`).
