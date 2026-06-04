## Context

HyperFrames (heygen-com/hyperframes, Apache-2.0) ships a 15-skill bundle in standard `SKILL.md` format — the same format pi already loads via `docs/skills.md`. Each skill is a directory under upstream `skills/` containing `SKILL.md` plus optional `scripts/`, `references/`, `templates/`, and `assets/`. Total payload is 2.5 MB across 172 files; 1.3 MB is the SFX library under `skills/website-to-hyperframes/assets/sfx/` (19 MP3s, Pixabay-licensed for redistribution + commercial use, no attribution required).

The repo's `.pi/skills/` already holds ~23 curated project skills (release-cut, debug-dashboard, openspec-*). Pi's skill loader supports a `skills[]` array in `.pi/settings.json` that accepts directory paths — vendored skills can therefore live anywhere on disk and be referenced by configuration rather than copied into `.pi/skills/`.

Upstream's latest tag at time of writing is `0.6.48` (matches `.claude-plugin/plugin.json` version).

## Goals / Non-Goals

**Goals:**
- Pi sessions opened against this repo discover all 15 HyperFrames SKILL.md trees via the standard pi skill loader, with zero per-machine setup.
- Vendored content carries enough metadata (license, source URL, pinned version) that any contributor can identify provenance from the tree alone.
- Upgrade procedure is a single re-runnable script — no manual file shuffling, no settings churn between versions.
- The project's curated skill namespace (`.pi/skills/`) stays visually distinct from third-party content.
- Documentation pointer lives where contributors look (`docs/hyperframes.md` + AGENTS.md one-liner), following this repo's Documentation Update Protocol.

**Non-Goals:**
- No CI render step. No template compositions. No committed video assets. (Deferred to `add-release-video-pipeline`.)
- No root `package.json` change. HyperFrames is invoked ad-hoc via `npx` from composition directories, not added as a project dep.
- No upstream fork. We vendor at a tag, never patch in place. Local edits to `vendor/hyperframes/` are forbidden (enforced by README convention; any patches need a separate `vendor/hyperframes/patches/` directory we deliberately leave undefined for now).
- No automatic upgrade. Bumps are intentional human acts.

## Decisions

### D1. Vendor under `vendor/hyperframes/`, not `.pi/skills/`

**Choice**: Place the upstream `skills/` tree at `vendor/hyperframes/skills/` and wire pi via `.pi/settings.json#skills[]`.

**Rationale**: `.pi/skills/` is the curated project namespace — 23 skills authored *for* pi-agent-dashboard. Adding 15 third-party skills inline pollutes greps ("which of these is ours?"), confuses contributors, and tangles upgrade ergonomics (re-copying into `.pi/skills/` risks clobbering or merge conflicts on the curated skills).

**Alternatives considered:**
- `.pi/skills/hyperframes-*/` inline — rejected: namespace pollution, copy-on-upgrade risk.
- `.pi/vendor/` — rejected: `.pi/` is pi-runtime-owned by convention; mixing vendored content in there is a category error.
- Submodule at `vendor/hyperframes/` — rejected: forces every contributor through submodule init, breaks shallow clones, adds friction for a 2.5 MB payload.
- Git subtree — viable but adds history weight; rejected for v1 in favor of a plain `rsync`-style copy via the update script. Subtree can be retrofitted later if upstream diffs become valuable.

### D2. Settings pointer, not file copy into `.pi/skills/`

**Choice**: `.pi/settings.json` gains `{ "skills": ["./vendor/hyperframes/skills"] }`.

**Rationale**: Pi documents `skills[]` accepting directories that get recursively scanned for `SKILL.md`. One line wires all 15 trees. Upgrade = re-run the script; settings never changes.

**Alternative rejected**: symlinks under `.pi/skills/` pointing at `vendor/hyperframes/skills/*` — works on Unix, breaks on Windows clones without `core.symlinks=true`, complicates `git status`.

### D3. Pin via `VERSION` file, not git tag inside vendor tree

**Choice**: Plain-text `vendor/hyperframes/VERSION` containing the pinned tag (e.g. `0.6.48`). The update script reads it, the README quotes it, future CI lints can grep it.

**Rationale**: Single source of truth. Avoids burying the pin in the script. Avoids re-encoding the tag in multiple docs.

### D4. Pinned-tag fetch, not pinned-commit

**Choice**: `scripts/update-hyperframes.sh` clones `--depth 1 --branch <tag>` and rsyncs `skills/` + `LICENSE` into `vendor/hyperframes/`.

**Rationale**: Tags match upstream release artifacts and what users see in `.claude-plugin/plugin.json`. Commits move; tags don't (for proper releases). Shallow clone keeps the script fast and disk-light. Rsync (not `cp -r`) makes the script idempotent — re-runs are no-ops, partial updates self-heal.

**Risk**: tag could be force-moved upstream. Mitigation: the script could optionally record commit hash too. Defer to a later iteration; not worth the complexity now.

### D5. Idempotent script, not Makefile target or npm script

**Choice**: Plain bash `scripts/update-hyperframes.sh`, invoked as `./scripts/update-hyperframes.sh [tag]` (default: read from `VERSION`).

**Rationale**: This repo already has `scripts/*.sh` (per the existing layout); no Makefile to wire into. Adding an npm script in root `package.json` would imply runtime/dev relationship that doesn't exist. The script is self-contained, easily auditable, and CI-friendly.

### D6. AGENTS.md gets one pointer row, not inline content

**Per the project's Documentation Update Protocol**:
- Per-file detail goes in the matching `docs/file-index-<area>.md` split. New rows for `vendor/hyperframes/*` and `scripts/update-hyperframes.sh` land there.
- AGENTS.md gets one ≤200-char pointer to `docs/hyperframes.md`. No inline file enumeration.
- The `docs/hyperframes.md` write is delegated to a subagent with the caveman-style rule passed verbatim in the prompt.

## Risks / Trade-offs

- **Context cost**: 15 skill descriptions always-on in every pi session opened in this repo (~3–5 KB). → Acceptable; the SFX library and authoring skills are the flagship use case for `add-release-video-pipeline`. Mitigated by pi's progressive disclosure (bodies load on demand).
- **Repo size grows by 2.5 MB**: 1.3 MB of that is MP3 SFX. → Pixabay license allows redistribution; SFX are valuable for release videos. Repo total impact <1% of current size; clones stay fast.
- **Upstream upgrade drift**: a new HyperFrames release could change skill names or break references. → The pinned `VERSION` file prevents accidental drift; bumps are intentional. Local renders against vendored skills are deterministic for the pinned tag.
- **License compliance**: Apache-2.0 requires preserving the LICENSE and any NOTICE on redistribution. → Upstream has no NOTICE file; we preserve LICENSE verbatim and add `vendor/hyperframes/README.md` summarizing provenance (covers §4(c) "attribution notices" requirement transparently even though strictly optional).
- **Pixabay SFX provenance**: Pixabay's terms permit redistribution within derivative works (rendered videos) but do not explicitly cover "redistribution of the raw asset library in a public repo." → Upstream already redistributes these MP3s in a public Apache-2.0 repo with CREDITS.md in place; we inherit that posture verbatim. If Pixabay tightens terms, the mitigation is to drop the SFX subdir in a follow-up (script flag `--no-sfx`); skill set stays functional, palette gets sourced per-render. **Not implementing the flag in v1** — keep it simple, revisit if/when needed.
- **Two readers of the version pin**: README quotes `0.6.48` and `VERSION` contains `0.6.48`. They can drift. → Convention: the README's version mention is informational; `VERSION` is canonical. The update script overwrites both atomically. Document this in `vendor/hyperframes/README.md`.

## Migration Plan

**Forward:**
1. Run `scripts/update-hyperframes.sh 0.6.48` (creates `vendor/hyperframes/`).
2. Edit `.pi/settings.json` to add `"./vendor/hyperframes/skills"` to `skills[]`.
3. Write `docs/hyperframes.md` (delegated subagent, caveman style).
4. Add AGENTS.md pointer line.
5. Add `docs/file-index-<area>.md` rows (delegated subagent, caveman style).
6. Commit; open PR.

**Rollback:**
- `git rm -r vendor/hyperframes/ scripts/update-hyperframes.sh docs/hyperframes.md`
- Revert `.pi/settings.json` and AGENTS.md edits.
- No runtime state to migrate, no DB, no cache. Removal is purely textual.

## Open Questions

(none at design stage — the proposal already deferred no questions to design. Implementation will surface concrete naming/path choices already resolved above.)
