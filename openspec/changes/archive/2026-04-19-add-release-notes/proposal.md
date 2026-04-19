## Why

The project has shipped 10 tagged releases (v0.2.0 → v0.2.9) with no `CHANGELOG.md`, no release notes in GitHub Releases, and no convention for writing them. Tag messages are one-line commit summaries, most of which are CI/installer plumbing that users don't care about. The upcoming release (33 unreleased commits on `main`) contains substantive user-facing work — recommended-extensions wizard, pi-core version checker + update UI, marketing site, error-banner collapse with Retry/Copy, image paste in explore dialog, Anthropic payload transform, provider-auth model refresh, prompt-template resolution fixes — and this work deserves to be communicated properly both to end users (GitHub Release body, in-app What's New later) and to developers (CHANGELOG.md).

We also need a documented convention so future releases don't slip back into one-line tag messages.

## What Changes

- Add `CHANGELOG.md` at the repo root following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format with SemVer-aligned version headings.
- Backfill a single collapsed entry covering `v0.2.0`–`v0.2.9` summarized as "initial public releases — installer and cross-platform CI hardening," with a brief bullet list of the few user-visible items (npm package rename, Windows ZIP/portable, arm64 artifacts).
- Author a rich entry for the next release (working title `v0.3.0`) grouping the 33 unreleased commits into `Added / Changed / Fixed / Refactored / Docs`, written for end users (feature-level, not commit-level).
- Add a `Unreleased` section at the top of `CHANGELOG.md` that future PRs append to.
- Add `docs/release-process.md` documenting the release workflow: commit conventions (we're already ~all `feat:`/`fix:`/`refactor:`/`docs:`/`chore:`), how to roll `Unreleased` into a versioned section at release time, how the GitHub Release body is derived from the CHANGELOG entry, and version-bump + tag procedure.
- Update `.github/workflows/publish.yml` to read the matching CHANGELOG section and use it as the GitHub Release body (replacing whatever default body the workflow currently produces). If extraction fails, fall back to the current behavior so releases never block on changelog parsing.
- Update `README.md` to link to `CHANGELOG.md` and to `docs/release-process.md`.
- Update `AGENTS.md` key-files table with the new files.

Out of scope (can be follow-ups):
- Automated changelog generation (`conventional-changelog`, `release-please`, `changesets`). We're staying manual-but-disciplined for now.
- In-app "What's New" dialog surfaced after upgrade.
- Backfilling rich per-version notes for v0.2.0–v0.2.9 individually (not worth it — the content is CI churn).

## Capabilities

### New Capabilities
- `release-notes`: Conventions, location, and format for human-authored release notes; how CHANGELOG entries map to Git tags and to GitHub Release bodies; what belongs in `Unreleased` vs. a versioned section; audience split between CHANGELOG (dev-facing, complete) and GitHub Release (user-facing, curated).

### Modified Capabilities
<!-- None. This introduces a new documentation/process capability; no existing spec's requirements change. -->

## Impact

- **New files**: `CHANGELOG.md`, `docs/release-process.md`.
- **Modified files**: `README.md` (add links), `AGENTS.md` (key-files table), `.github/workflows/publish.yml` (derive Release body from CHANGELOG).
- **No code changes** to the server, extension, client, or electron packages.
- **No API changes**, no schema changes, no migration.
- **Process change**: future PRs that ship user-visible behavior should add a bullet under `## [Unreleased]` in `CHANGELOG.md`. Enforced by convention + review, not by CI (at least initially).
- **Release workflow change**: `publish.yml` will parse `CHANGELOG.md` for the tag's section. Low risk — falls back to default body if parsing fails.
