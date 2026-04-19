# Release Process

This doc is the canonical how-to for cutting a pi-agent-dashboard release.
The goal is **low-friction, human-curated release notes** — no generator
tooling, just discipline during development plus a curation pass at tag time.

## Overview

```
 ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
 │  Development   │ ──▶ │   Cut release  │ ──▶ │   CI publishes │
 │                │     │                │     │                │
 │  PR appends    │     │  Promote       │     │  npm +         │
 │  bullets to    │     │  [Unreleased]  │     │  Electron      │
 │  [Unreleased]  │     │  bump + tag    │     │  GitHub Release│
 └────────────────┘     └────────────────┘     └────────────────┘
```

Single source of truth: [`CHANGELOG.md`](../CHANGELOG.md). The GitHub Release
body is **extracted automatically** from the matching section at tag time.

## Commit Conventions

The project uses [Conventional Commits](https://www.conventionalcommits.org/)
prefixes, lightly enforced **by code review only** (no commit lint, no husky
hooks).

| Prefix      | Meaning                                          |
|-------------|--------------------------------------------------|
| `feat:`     | User-visible new capability                      |
| `fix:`      | Bug fix                                          |
| `refactor:` | Internal restructure, no behaviour change        |
| `docs:`     | Docs-only changes                                |
| `test:`     | Test-only changes                                |
| `chore:`    | Dependency bumps, tooling, version bumps         |
| `ci:`       | CI / release workflow changes                    |

Optional scopes in parens are encouraged (`feat(error-banner): …`).

## During Development

When your PR ships user-visible behaviour, **add a bullet** under the matching
subsection of `## [Unreleased]` in `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- Drop-and-paste screenshots directly into the OpenSpec explore dialog.

### Changed

### Fixed
- Fork entryId timing: leaf registry now resolves the parent message correctly.
```

Write bullets in **end-user language**, not commit-subject shorthand. Link to
relevant docs when helpful. Absence of a bullet does **not** block the PR —
the release author will back-fill during curation.

## Cutting a Release

### 1. Curate `Unreleased`

- Review `git log <last-tag>..HEAD` and confirm every user-visible change
  has a bullet under `## [Unreleased]`.
- Add anything contributors missed.
- Tighten wording. Reorder for impact.
- Decide the next version per SemVer: feature additions → minor bump, bug
  fixes only → patch bump, breaking changes → major bump.

### 2. Promote `Unreleased` → versioned section

In `CHANGELOG.md`:

1. Rename `## [Unreleased]` to `## [<version>] - <YYYY-MM-DD>` (today's date,
   no leading `v`).
2. Insert a fresh empty `## [Unreleased]` section **above** it:

   ```markdown
   ## [Unreleased]

   ### Added

   ### Changed

   ### Fixed

   ## [<version>] - <YYYY-MM-DD>
   ...
   ```

### 3. Bump workspace versions

```bash
npm version <version> --workspaces --include-workspace-root --no-git-tag-version
```

This updates `package.json` and every workspace under `packages/*` in a single
commit-worthy edit. Verify with `git diff package.json packages/*/package.json`.

### 4. Commit

```bash
git add CHANGELOG.md package.json package-lock.json packages/*/package.json
git commit -m "chore(release): v<version>"
```

### 5. Tag and push

```bash
git tag v<version>
git push origin main
git push origin v<version>
```

The tag push triggers `.github/workflows/publish.yml`.

## What CI Does

On a `v*` tag push, `publish.yml`:

1. **`publish` job** — publishes the npm package with provenance.
2. **`electron` job (matrix)** — builds DMG (macOS arm64), DEB + AppImage
   (Linux x64 + arm64), NSIS + ZIP + portable (Windows x64 + arm64).
3. **`github-release` job** —
   - Extracts the `## [<version>]` section from `CHANGELOG.md` into
     `release-notes.md`.
   - If extraction fails or returns empty, writes a one-line fallback body
     pointing at `CHANGELOG.md` and logs a warning.
   - Calls `softprops/action-gh-release@v2` with `body_path: release-notes.md`,
     `draft: true`, and all Electron artifacts attached.

The release lands as a **draft** — nothing is published until you click
*Publish* on the GitHub Releases page.

## Manual Fallback

If the auto-extracted body rendered incorrectly (missing section, wrong
version, truncated bullets), you can fix it before publishing:

1. Open the draft release on GitHub.
2. Replace the body with the correct content from `CHANGELOG.md`.
3. Click *Publish release*.

If something worse happens (no release at all, wrong artifacts), the tag can
be deleted, the issue fixed, and the tag re-pushed:

```bash
git push --delete origin v<version>
git tag --delete v<version>
# fix the issue, bump if needed
git tag v<version>
git push origin v<version>
```

## After Publishing

- Announce in the project's channels (Discord, X, etc. — if/when they exist).
- Monitor the GitHub Issues tracker for install/upgrade regressions.
- Leave `## [Unreleased]` empty-but-present so the next contributor has an
  obvious target.
