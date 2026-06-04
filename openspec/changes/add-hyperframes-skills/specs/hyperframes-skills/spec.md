## ADDED Requirements

### Requirement: Vendored HyperFrames skill bundle is discoverable by pi sessions

The repo SHALL ship the upstream HyperFrames `skills/` tree at a stable, versioned in-repo path, and pi sessions opened against this repo SHALL discover all bundled SKILL.md files via the standard pi skill loader without per-machine setup.

#### Scenario: Fresh clone discovers all 15 HyperFrames skills

- **WHEN** a contributor clones the repo and starts a pi session from the repo root
- **THEN** every SKILL.md under the vendored tree is enumerated by pi's skill loader
- **AND** the skill names appear in the system prompt's available-skills list
- **AND** invoking any of them via `/skill:<name>` loads the full SKILL.md body

#### Scenario: Discovery requires no manual install step

- **WHEN** a contributor has a fresh checkout and has not run any setup beyond `git clone`
- **THEN** pi discovers the vendored skills automatically via `.pi/settings.json`
- **AND** no `npm install`, no `npx skills add`, and no environment variable is required for discovery

### Requirement: Vendored tree carries license and version metadata

The vendored tree SHALL preserve upstream license text verbatim and SHALL declare its pinned upstream version in a machine-readable file.

#### Scenario: Apache-2.0 LICENSE is preserved

- **WHEN** an auditor inspects `vendor/hyperframes/LICENSE`
- **THEN** the file content is byte-identical to upstream `LICENSE` at the pinned tag
- **AND** no project header, comment, or modification has been added

#### Scenario: Pinned version is readable as a single line

- **WHEN** a script or contributor reads `vendor/hyperframes/VERSION`
- **THEN** the file contains exactly one line: the upstream tag string (e.g. `0.6.48`)
- **AND** no other file in the vendored tree is treated as authoritative for the pin

#### Scenario: Provenance README documents source

- **WHEN** a contributor opens `vendor/hyperframes/README.md`
- **THEN** the README states the upstream repository URL
- **AND** the README states the pinned version
- **AND** the README summarizes licensing (Apache-2.0 for code, Pixabay Content License for the SFX under `website-to-hyperframes/assets/sfx/`)
- **AND** the README documents the supported upgrade procedure

### Requirement: Upgrade procedure is idempotent and re-runnable

The repo SHALL provide a single script that pulls a specified upstream tag and synchronizes `vendor/hyperframes/` to it; re-running the script with the same tag SHALL be a no-op.

#### Scenario: First run populates the vendor tree

- **WHEN** `vendor/hyperframes/skills/` does not exist
- **AND** a contributor runs `./scripts/update-hyperframes.sh 0.6.48`
- **THEN** the script exits 0
- **AND** `vendor/hyperframes/skills/` contains the upstream `skills/` tree at tag `0.6.48`
- **AND** `vendor/hyperframes/LICENSE` matches upstream LICENSE at that tag
- **AND** `vendor/hyperframes/VERSION` contains `0.6.48`

#### Scenario: Re-run at the same tag is a no-op

- **WHEN** `vendor/hyperframes/` is already at tag `0.6.48`
- **AND** a contributor runs `./scripts/update-hyperframes.sh 0.6.48`
- **THEN** the script exits 0
- **AND** `git status` shows no changes in `vendor/hyperframes/`

#### Scenario: Upgrade to a newer tag updates the tree atomically

- **WHEN** `vendor/hyperframes/VERSION` contains `0.6.48`
- **AND** a contributor runs `./scripts/update-hyperframes.sh 0.6.49`
- **THEN** the script exits 0
- **AND** `vendor/hyperframes/VERSION` contains `0.6.49`
- **AND** `vendor/hyperframes/skills/` matches upstream `skills/` at tag `0.6.49`
- **AND** any file removed upstream between `0.6.48` and `0.6.49` is removed locally
- **AND** any file added upstream is present locally

#### Scenario: Default tag is read from VERSION

- **WHEN** a contributor runs `./scripts/update-hyperframes.sh` without arguments
- **THEN** the script reads the pinned tag from `vendor/hyperframes/VERSION`
- **AND** the run is equivalent to passing that tag explicitly

### Requirement: Project skill namespace stays uncontaminated

The vendored skills SHALL NOT be copied into, symlinked into, or otherwise mixed with the project-curated skills under `.pi/skills/`.

#### Scenario: .pi/skills/ contains only project-authored skills

- **WHEN** an auditor lists `.pi/skills/`
- **THEN** no entry under `.pi/skills/` is a HyperFrames skill
- **AND** no entry under `.pi/skills/` points (directly or transitively) at `vendor/hyperframes/`

#### Scenario: Vendored skills are discoverable purely via settings

- **WHEN** `.pi/settings.json` is inspected
- **THEN** the `skills` array contains an entry pointing at the vendored skills directory
- **AND** removing that entry alone is sufficient to disable HyperFrames skill discovery

### Requirement: Documentation points contributors at the vendored bundle

The repo SHALL document the existence, purpose, and upgrade path of the vendored bundle in a location contributors can find via the project's existing documentation conventions.

#### Scenario: Topic doc exists at the expected path

- **WHEN** a contributor browses `docs/`
- **THEN** `docs/hyperframes.md` exists
- **AND** the doc covers: what HyperFrames is, where the vendored copy lives, how to render locally, how to upgrade, licensing summary

#### Scenario: AGENTS.md points to the topic doc

- **WHEN** a contributor reads `AGENTS.md`
- **THEN** AGENTS.md contains a one-line pointer to `docs/hyperframes.md`
- **AND** AGENTS.md does NOT enumerate vendored files inline (per the Documentation Update Protocol)

#### Scenario: File-index split records new files

- **WHEN** a contributor checks the matching `docs/file-index-<area>.md` split
- **THEN** rows exist for `vendor/hyperframes/README.md`, `vendor/hyperframes/LICENSE`, `vendor/hyperframes/VERSION`, and `scripts/update-hyperframes.sh`
- **AND** each row's purpose field follows caveman style
