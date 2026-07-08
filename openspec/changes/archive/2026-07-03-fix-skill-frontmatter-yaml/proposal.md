## Why

Three project skills — `ship-change`, `frontend-mockup-loop`, `anti-slop-frontend` — fail to load on every pi startup with `Nested mappings are not allowed in compact mappings`. Their `SKILL.md` frontmatter has an **unquoted** `description:` whose value contains an inline `Triggers: "..."` — the `colon-space` makes the YAML parser read the scalar as an attempted nested mapping. The skills are silently unavailable, including `ship-change`, the entire post-apply ship pipeline. Nothing catches this at authoring time, so it will recur.

## What Changes

- Quote (or block-scalar) the `description:` value in the three broken `SKILL.md` files so their frontmatter parses as valid YAML. No wording change — only make the scalar unambiguous.
- Add a repo guard (unit test over every `**/SKILL.md`) that parses each file's frontmatter as YAML and asserts a non-empty `description`, failing CI on any unparseable or descriptionless skill manifest.
- Document the authoring rule (descriptions containing `: ` — e.g. `Triggers:` — MUST be quoted) so future skills are written correctly.
- **Out of scope (upstream, note only):** the pi-core skill loader (`node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js`) tolerating unquoted descriptions, and its `description is required` false-positive on `.pi/skills/AGENTS.md`. Both live in pi core, not this repo. Captured as upstream follow-ups in design.md.

## Capabilities

### New Capabilities
- `skill-frontmatter-validity`: every `SKILL.md` in the repo SHALL have YAML-parseable frontmatter with a non-empty `description`, enforced by an automated guard.

### Modified Capabilities
<!-- none: authoring-skills is scoped to specific ported skills, not a repo-wide frontmatter invariant -->

## Impact

- Files fixed: `.pi/skills/ship-change/SKILL.md`, `packages/mockup-loop/.pi/skills/frontend-mockup-loop/SKILL.md`, `packages/anti-slop/.pi/skills/anti-slop-frontend/SKILL.md`.
- New test asset (guard) under the repo test suite; runs in `npm test` / CI.
- No runtime/product code changes; no API or protocol impact.
- Restores 3 skills to the loaded set on next pi startup.
