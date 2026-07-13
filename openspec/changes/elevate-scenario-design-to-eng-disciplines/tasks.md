# Tasks

## 1. Decouple the skill body (in place, before moving)

- [ ] 1.1 Rewrite Phase 4: route each scenario to "your project's test levels" (scenario-nature → level *method* preserved); demote the concrete `unit / qa VM smoke / Playwright e2e` table into an explicitly-marked "Example: pi-agent-dashboard levels" callout that reproduces the current routing verbatim in intent.
- [ ] 1.2 Change the output-location step from hardcoded `openspec/changes/<name>/test-plan.md` to a parameter ("write to your change/spec's test-plan location"); soften `compatibility` frontmatter to "Optional: OpenSpec change spec as input".
- [ ] 1.3 Confirm the portable core is untouched: Triple, ISTQB cheatsheet, "scenario ≠ smoke" rule, STOP-and-ask gate, guardrails.

## 2. Move into eng-disciplines

- [ ] 2.1 `git mv .pi/skills/scenario-design packages/eng-disciplines/.pi/skills/scenario-design` (SKILL.md + any support files).
- [ ] 2.2 Verify no copy remains under root `.pi/skills/` (grep for `scenario-design/SKILL.md` → single match).

## 3. Wire the package manifest

- [ ] 3.1 Add `.pi/skills/scenario-design` to `pi.skills[]` in `packages/eng-disciplines/package.json` (8 → 9 entries).
- [ ] 3.2 Bump the package version; extend `keywords` (+`test-design`, +`scenario-design`) and the `description` to mention test-scenario design.
- [ ] 3.3 Confirm `files[]` already ships `.pi/skills/` (no change needed) — assert the moved dir is included.

## 4. Docs

- [ ] 4.1 Add a skills-table row for scenario-design to `packages/eng-disciplines/README.md`.
- [ ] 4.2 Add the DOX row to `packages/eng-disciplines/AGENTS.md` (caveman style, path-alphabetical).
- [ ] 4.3 Update the root project skills list references if any doc enumerates `.pi/skills/scenario-design` (search `docs/`, delegate `docs/` edits per Documentation Update Protocol Rule 6).

## 5. Discipline checkpoint — doubt-driven-review

- [ ] 5.1 Before finalizing, diff the new parameterized Phase 4 against the old table on one known dashboard change; confirm rendered-UI scenarios still route to Playwright and qa/ stays CLI-smoke (AGENTS.md hard rule).

## 6. Validate

- [ ] 6.1 `openspec validate elevate-scenario-design-to-eng-disciplines` passes.
- [ ] 6.2 Start a pi session, confirm eng-disciplines exposes 9 skills incl. scenario-design; trigger it ("find edge cases") and confirm the body loads.
- [ ] 6.3 `npm test` green (no test references the old root skill path).
