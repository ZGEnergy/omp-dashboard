## 1. Upgrade script

- [ ] 1.1 Create `scripts/update-hyperframes.sh` accepting an optional tag arg; default reads from `vendor/hyperframes/VERSION` (if missing, error with a clear message pointing at v1 bootstrap usage)
- [ ] 1.2 Script does shallow clone `--depth 1 --branch <tag>` of `https://github.com/heygen-com/hyperframes` into a tempdir
- [ ] 1.3 Script rsyncs `<tempdir>/skills/` → `vendor/hyperframes/skills/` with `--delete` so removed-upstream files vanish locally
- [ ] 1.4 Script copies `<tempdir>/LICENSE` → `vendor/hyperframes/LICENSE` verbatim
- [ ] 1.5 Script writes `<tag>` to `vendor/hyperframes/VERSION` (single line, no trailing junk)
- [ ] 1.6 Script cleans tempdir on exit (trap), is idempotent on re-run, sets `set -euo pipefail`
- [ ] 1.7 Script prints a one-line summary on success: `hyperframes: vendored at <tag> (<N> files)`

## 2. Initial vendor bootstrap

- [ ] 2.1 Run `./scripts/update-hyperframes.sh 0.6.48` to populate `vendor/hyperframes/`
- [ ] 2.2 Verify `vendor/hyperframes/skills/` contains 15 SKILL.md trees (matches upstream)
- [ ] 2.3 Verify `vendor/hyperframes/LICENSE` is byte-identical to upstream LICENSE at the pinned tag
- [ ] 2.4 Verify `vendor/hyperframes/VERSION` contains exactly `0.6.48`

## 3. Provenance README

- [ ] 3.1 Author `vendor/hyperframes/README.md` covering: source URL, pinned version (informational mention; cross-references `VERSION` as canonical), Apache-2.0 summary, Pixabay Content License summary for the SFX subdir, the supported upgrade procedure (one-line invocation of the script), and a "do not edit in place" notice
- [ ] 3.2 Confirm the README is caveman-style (per the project's Documentation Update Protocol)

## 4. Pi settings wiring

- [ ] 4.1 Read current `.pi/settings.json` (preserve existing keys exactly)
- [ ] 4.2 Add `"./vendor/hyperframes/skills"` as a new entry in the `skills` array (create the array if absent)
- [ ] 4.3 Restart any active pi session in this repo and verify the 15 SKILL.md trees appear in the available-skills listing

## 5. Project documentation

- [ ] 5.1 Delegate authoring of `docs/hyperframes.md` to a general-purpose subagent with the caveman-style rule passed verbatim in its prompt (per AGENTS.md docs protocol); doc covers: what HyperFrames is, where vendored copy lives, render workflow (`cd <comp-dir> && npx hyperframes preview|render`), upgrade procedure (one-line script invocation), licensing summary, "do not edit in place" rule
- [ ] 5.2 Add a one-line pointer (≤200 chars) to `docs/hyperframes.md` in AGENTS.md's pointer section; do NOT enumerate any vendored files inline
- [ ] 5.3 Identify the matching `docs/file-index-<area>.md` split via `docs/file-index.md`; delegate row additions to a subagent (caveman-style rule in prompt) for: `vendor/hyperframes/README.md`, `vendor/hyperframes/LICENSE`, `vendor/hyperframes/VERSION`, `scripts/update-hyperframes.sh`
- [ ] 5.4 Do NOT add per-file rows for the contents of `vendor/hyperframes/skills/` (these are upstream-authored; index entries would create maintenance burden on every upgrade)

## 6. Verification

- [ ] 6.1 Re-run `./scripts/update-hyperframes.sh 0.6.48` and confirm `git status` shows no changes (idempotency proof)
- [ ] 6.2 Run `openspec validate add-hyperframes-skills` and confirm zero errors
- [ ] 6.3 Manually invoke at least one vendored skill via pi (e.g. `/skill:hyperframes-cli`) to confirm full-body loading works through the settings pointer
- [ ] 6.4 Confirm `.pi/skills/` listing is unchanged (no contamination from the vendor bundle)
- [ ] 6.5 Confirm clone size delta is within ~2.5–3.0 MB of pre-change baseline
