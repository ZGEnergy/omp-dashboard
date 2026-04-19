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

## [0.3.0] - 2026-04-19

First release with curated, human-authored notes. Headline: package management
gets a proper home (recommended extensions, pi-core updater), the explore dialog
accepts pasted screenshots, errors are readable again, and a public marketing
site goes live.

### Added

- **Recommended extensions**: new *Packages* tab surfaces a curated set of pi
  extensions (pi-anthropic-messages, pi-subagents, pi-flows, pi-web-access,
  pi-agent-browser) with install/uninstall actions, live npm/GitHub enrichment,
  and a top-of-page banner when any *required* extension is missing from
  `~/.pi/agent/settings.json`.
- **Recommended-extensions wizard step** in the first-run setup, with
  already-installed entries greyed out.
- **Pi core version checker + updater**: a new header badge shows how many pi
  ecosystem core packages (pi itself, pi-dashboard, pi-model-proxy, …) have
  updates available. A *Packages* settings section lists current → latest
  versions with per-package and "Update All" actions, live progress, and
  automatic session reload on successful update.
- **Image paste in the OpenSpec explore dialog** — drop or paste screenshots
  directly into the explore prompt, matching the main command input. Powered by
  a shared `useImagePaste` hook and `ImagePreviewStrip` component so behaviour
  is identical across both surfaces.
- **Error banner improvements**: long LLM errors now collapse to a summary line
  with *Retry* and *Copy* buttons; full detail expands on demand.
- **Model selector upgrades**: provider filter and multi-token typeahead search
  in the model picker. The same `ModelSelector` component now powers the
  default-model setting in *Settings*.
- **Anthropic payload transform extension** for the main session, delegating
  the transform to the shared `@pi/anthropic-messages` package.
- **Public marketing site** at `/site` (Astro + Tailwind + MDX + Preact)
  deployed to GitHub Pages via `.github/workflows/deploy-site.yml`, with a
  50 KB gzipped JS budget enforced in CI.

### Changed

- **Provider auth flow**: saving provider credentials now broadcasts
  `credentials_updated` to all sessions, refreshes the model registry, and
  pushes updated models to every connected client. The model selector updates
  in place without a manual reload.
- **OAuth device flow**: replaced the auto-popup with an explicit button so
  the browser no longer gets blocked by popup policies.
- **Folder action bar**: removed the deprecated *+Terminal* quick-create
  button. Use the *Terminals* tab to open a new PTY.
- **File search**: replaced the `fd` binary dependency with a native Node.js
  directory walk, eliminating a platform-specific binary and simplifying
  packaging for Windows and portable installs.
- **`CommandInput` refactor**: image-paste logic extracted into the shared
  `useImagePaste` hook and `ImagePreviewStrip` component (see *Added* above).

### Fixed

- **Portable Windows**: `pi-coding-agent` is now resolved from the managed
  install under `~/.pi-dashboard/node_modules/` instead of expecting a system
  install — portable zips work out of the box.
- **Prompt templates**: resolved from global skills and installed packages,
  not just the local project. Template names are split on any whitespace so
  multi-line arguments work.
- **Installed-packages list** auto-refreshes after install/remove/update
  operations complete — no more stale counts.
- **Assistant text in replay / fork messages** now renders properly instead
  of showing an empty separator.
- **New terminal tabs** auto-focus when created and the UI navigates to the
  folder view.
- **Fork entryId timing**: leaf registry fix so forked sessions resolve their
  parent message correctly.
- **Roles edit from dashboard** now works as expected.
- **`ask_user` tool**: hardened argument validation to reject malformed
  payloads instead of silently misbehaving.
- **Pi core update completion**: server now broadcasts
  `pi_core_update_complete` so the header badge refetches and clears.
- **Server robustness**: `node-pty` permissions fix is now hoist-aware (works
  regardless of which workspace triggered the install), and the browser
  gateway logs handler errors instead of swallowing them silently.

### Docs

- README updated with Electron standalone install instructions, monorepo
  paths, and new feature callouts.
- OpenSpec proposals added for the dashboard-ux-fixes batch and the explore
  dialog image-paste change.

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
