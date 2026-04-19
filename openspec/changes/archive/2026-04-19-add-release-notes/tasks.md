## 1. Draft CHANGELOG.md

- [x] 1.1 Create `CHANGELOG.md` at repo root with Keep a Changelog 1.1.0 header block, a link to https://keepachangelog.com/en/1.1.0/, and a note referencing Semantic Versioning
- [x] 1.2 Add a `## [Unreleased]` section with empty `### Added`, `### Changed`, and `### Fixed` subsections immediately below the header
- [x] 1.3 Author the `## [0.3.0] - <release-date-placeholder>` entry covering the 33 commits since `v0.2.9`, grouped into Added / Changed / Fixed / Removed subsections, written in end-user language (not commit subjects). Source material to cover: recommended-extensions wizard step + section + missing-required banner, pi-core version checker + Update All/Per-package update + header badge, marketing site + GitHub Pages deploy, error-banner collapse with Retry + Copy, image paste in OpenSpec explore dialog (via shared useImagePaste + ImagePreviewStrip), Anthropic payload transform extension, provider-auth model-selector refresh and credentials_updated broadcast, prompt-template whitespace + global-skills resolution fixes, `ask_user` argument validation hardening, native Node.js file search (replacing fd), auto-focus newly created terminal tab, fork/replay assistant-text rendering fix, auto-refresh installed packages list, portable Windows pi-coding-agent resolution, ModelSelector reused for default-model setting with provider filter and multi-token search, node-pty permissions hoist-aware fix, browser-gateway handler error surfacing
- [x] 1.4 Author the `## [0.2.0 – 0.2.9] - 2026-04-13 – 2026-04-16` collapsed backfill entry summarizing "initial public releases — installer and cross-platform CI hardening" with 4–6 bullets (npm package rename to `@blackbelt-technology/pi-agent-dashboard`, Windows ZIP + portable installers, arm64 artifacts, AppImage / libfuse2, Docker cross-build pipeline)
- [x] 1.5 Verify `CHANGELOG.md` parses correctly — every `## [<version>]` heading starts at column 0, no stray `##` headings inside code blocks, subsections are `### Added` / `### Changed` etc. only
- [x] 1.6 Add reference-style link definitions at the bottom if used (optional; keep inline links if simpler)

## 2. Author docs/release-process.md

- [x] 2.1 Create `docs/release-process.md` with sections: Overview, Commit Conventions, During Development (Unreleased bullet workflow), Cutting a Release (promote Unreleased → versioned, bump version, tag + push), What CI Does, Manual Fallback (editing a GitHub Release after the fact)
- [x] 2.2 Document the exact `npm version <version> --workspaces --include-workspace-root --no-git-tag-version` command and the `git tag v<version> && git push --tags` follow-up
- [x] 2.3 Document the Conventional-Commits prefixes the project uses (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:`, `test:`) and note that enforcement is by review, not CI
- [x] 2.4 Include a short troubleshooting section: what to do if the CHANGELOG-extraction step mis-rendered (edit the draft Release on GitHub before publishing)

## 3. Wire CHANGELOG extraction into release workflow

- [x] 3.1 In `.github/workflows/publish.yml`, in the `github-release` job, add a step before `softprops/action-gh-release@v2` named "Extract release notes from CHANGELOG" that runs a small inline script (Node or `awk`) which:
  - Reads `CHANGELOG.md`
  - Strips the leading `v` from `${{ github.ref_name }}`
  - Finds the first line matching `^## \[<version>\]`
  - Captures everything until the next `^## \[` heading (exclusive) or EOF
  - Writes the captured block to `release-notes.md` in the workspace
  - On any failure (no match, empty body, script error) writes a one-line fallback body such as "See [CHANGELOG.md](https://github.com/BlackBeltTechnology/pi-agent-dashboard/blob/main/CHANGELOG.md) for full notes." and sets a step output `fallback=true`
- [x] 3.2 Change the `softprops/action-gh-release@v2` invocation to use `body_path: release-notes.md` and remove (or set to `false` when extraction succeeded) `generate_release_notes`. Keep `draft: true` so the author reviews before publishing.
- [x] 3.3 Add `actions/checkout@v4` to the `github-release` job if not already present (required to read `CHANGELOG.md`). Verify with the existing job definition before editing.
- [x] 3.4 Smoke-test the extraction script locally by running it against `CHANGELOG.md` with `GITHUB_REF_NAME=v0.3.0` and verifying the v0.3.0 section is captured; also run with a bogus version to confirm fallback triggers without throwing

## 4. Update README and AGENTS

- [x] 4.1 Add a "Changelog" link to `README.md` pointing to `CHANGELOG.md`, placed in a natural location (near top, or under a Links / Further Reading section — check current README structure)
- [x] 4.2 Add a "Release Process" link in the contributor-facing part of `README.md` pointing to `docs/release-process.md`
- [x] 4.3 Add entries to the `AGENTS.md` key-files table for `CHANGELOG.md` ("Human-authored release notes per version; source of GitHub Release bodies") and `docs/release-process.md` ("Canonical how-to for cutting a release")

## 5. Validate and hand off

- [x] 5.1 Run `openspec validate add-release-notes --strict` and confirm the change is valid
- [x] 5.2 Run `openspec status --change add-release-notes` and confirm `4/4 artifacts complete` plus all tasks checked
- [x] 5.3 Open `CHANGELOG.md` in a Markdown renderer (e.g., `gh markdown-preview`, VS Code preview, or GitHub's web UI on a branch) and confirm headings render correctly and links work
- [x] 5.4 Commit with message `docs: add CHANGELOG.md, release process, and derive GitHub Release body from CHANGELOG`
