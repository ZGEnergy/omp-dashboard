# Changelog

All notable changes to **pi-agent-dashboard** are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the release workflow (including how `Unreleased` becomes a versioned section),
see [`docs/release-process.md`](docs/release-process.md).

## [Unreleased]

### Fixed
- **Electron terminal spawn on macOS** — `node-pty`'s `spawn-helper` binary was shipped without execute permission in Electron bundles (npm hoisting skipped the postinstall fix), causing silent `posix_spawnp failed` errors. Added three-layer defense: build-time `chmod +x` + quarantine removal in `bundle-server.sh`, and a runtime permission fix in `createTerminalManager()` as fallback.

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
