## 1. Write the guard first (TDD)

- [x] 1.1 Add a unit test that globs every `**/SKILL.md` (exclude `node_modules`, `dist`, worktrees), extracts the `---`-fenced frontmatter, parses it with the repo's YAML parser, and asserts `description` is a non-empty trimmed string; on failure, names the offending file.
- [x] 1.2 Run the guard and confirm it FAILS on the three current offenders (`ship-change`, `frontend-mockup-loop`, `anti-slop-frontend`) — proving the test catches the real bug.

## 2. Fix the three broken descriptions

- [x] 2.1 `.pi/skills/ship-change/SKILL.md` — wrap the `description:` value in double quotes, escaping inner `"`; wording unchanged.
- [x] 2.2 `packages/mockup-loop/.pi/skills/frontend-mockup-loop/SKILL.md` — same quoting fix; wording unchanged.
- [x] 2.3 `packages/anti-slop/.pi/skills/anti-slop-frontend/SKILL.md` — same quoting fix; wording unchanged.

## 3. Verify

- [x] 3.1 Re-run the guard from 1.1 — it now PASSES for all `SKILL.md` including the three fixed files.
- [x] 3.2 Restart pi (or reload) and confirm the three `Nested mappings…` warnings are gone and the skills appear in the loaded set.
- [x] 3.3 `npm test` green (2 pre-existing, unrelated flakes: node-electron npm-argv resolution + doctor-route timing; neither touches skills).

## 4. Document + note upstream

- [x] 4.1 Add a one-line authoring rule near skill-authoring docs: descriptions containing `: ` (e.g. `Triggers:`) MUST be quoted or block scalars.
- [x] 4.2 Record the two upstream follow-ups (loader tolerance for unquoted descriptions; `.pi/skills/AGENTS.md` `description is required` false-positive) as a note — no in-repo fix, pi-core owned.
