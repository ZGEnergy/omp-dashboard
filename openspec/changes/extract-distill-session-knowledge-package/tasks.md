# Tasks

## 1. Publish the engine package

- [ ] 1.1 In `packages/session-distiller/package.json`: remove `private: true`; add `publishConfig.access: "public"`, `license: "MIT"`, `repository.directory: "packages/session-distiller"`, `keywords`.
- [ ] 1.2 Set a real starting `version` (0.0.0 → e.g. 0.1.0) — gated on the security review (task 5).
- [ ] 1.3 Add a `files[]` allowlist (`src/`, `bin/`, README, NOTICE); add a `README.md` and, if any third-party research/code is attributed, a `NOTICE`.
- [ ] 1.4 Confirm the `distill-session-knowledge` bin still resolves and runs from the packaged layout.

## 2. Create the thin skill package

- [ ] 2.1 Scaffold `packages/distill-session-knowledge/` with `package.json`: `pi.skills: [".pi/skills/distill-session-knowledge"]`, `publishConfig.access: "public"`, `license: "MIT"`, `files: [".pi/skills/", "README.md", "NOTICE"]`, `repository.directory`.
- [ ] 2.2 Add `dependencies["@blackbelt-technology/pi-dashboard-session-distiller"]` (workspace-linked in-repo; `^`-range for publish).
- [ ] 2.3 `git mv .pi/skills/distill-session-knowledge packages/distill-session-knowledge/.pi/skills/distill-session-knowledge`.
- [ ] 2.4 Update the SKILL.md body so procedure/verification steps invoke the engine via the published `distill-session-knowledge` bin or the package's exported API — no repo-relative `packages/session-distiller` path.
- [ ] 2.5 Verify no copy of the skill remains under root `.pi/skills/` (grep → single match).

## 3. Release wiring

- [ ] 3.1 Add both packages to the `release-cut` published workspace set; update the `release-cut` skill's package tally (8 → 10).
- [ ] 3.2 Ensure both cut together (same release) to avoid version skew; note the ordering (engine before skill if publish order matters for dep resolution).

## 4. Docs

- [ ] 4.1 Add DOX rows for `packages/session-distiller/` (updated: now published) and `packages/distill-session-knowledge/` (new) in their directory `AGENTS.md` files.
- [ ] 4.2 One-line top-level pointer only if architecturally warranted; otherwise none (per Documentation Update Protocol default).

## 5. Discipline checkpoint — security-hardening (gates publish)

- [ ] 5.1 Audit the miner + any bundled fixtures/README examples: confirm no raw secrets/PII/absolute session paths are emitted into distilled artifacts or shipped in the package.
- [ ] 5.2 Confirm this before setting the engine's non-`0.0.0` version (task 1.2) — public publish is the point of no return.

## 6. Validate

- [ ] 6.1 `cd packages/session-distiller && npx vitest run` — 46 tests green after packaging edits.
- [ ] 6.2 `openspec validate extract-distill-session-knowledge-package` passes.
- [ ] 6.3 Load the thin package in a pi session; confirm `distill-session-knowledge` triggers and the engine invocation resolves via the dependency.
- [ ] 6.4 `npm test` green at repo root.
