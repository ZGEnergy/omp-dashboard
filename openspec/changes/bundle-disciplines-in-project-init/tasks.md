## 1. Publication prerequisite (blocking)

- [ ] 1.1 Verify `npm view @blackbelt-technology/pi-dashboard-eng-disciplines version` returns a version; if not, publication of the package is a blocking predecessor
- [ ] 1.2 Confirm the published (or to-be-published) version includes `systematic-debugging` + `node-inspect-debugger` (from `add-debugging-skills`); if it does not yet, the checkpoint table's last two rows carry the "pending add-debugging-skills" footnote

## 2. Doctrine in the coding profile template

- [ ] 2.1 Add the discipline-checkpoint table (same seven-row content as `wire-discipline-skills-into-openspec`) to `packages/extension/.pi/skills/project-init/profiles/coding/AGENTS.md.tmpl`, adjacent to its `## OpenSpec` section
- [ ] 2.2 Add the `## Discipline Skills` proposal-authoring convention paragraph to the same template
- [ ] 2.3 Add the graceful-degradation footnote line under the table: "Discipline skills not detected — run `pi install npm:@blackbelt-technology/pi-dashboard-eng-disciplines` to activate the checkpoints above." (kept in the template; harmless once skills are present)

## 3. Ensure-skills step in project-init SKILL.md

- [ ] 3.1 Add a new step **"Ensure discipline skills (coding profile)"** after `## Step 4 — Write the scaffold`, gated to the `coding` profile only (mirroring the `dox`-gated Step 5 pattern)
- [ ] 3.2 Detection: `pi list` grep for `pi-dashboard-eng-disciplines`, or stat `~/.pi/agent/npm/node_modules/@blackbelt-technology/pi-dashboard-eng-disciplines`; tolerate a missing `pi` binary (skip → footnote, do not error the init)
- [ ] 3.3 If absent: `ask_user` (confirm) offering the global install; on yes run `pi install npm:@blackbelt-technology/pi-dashboard-eng-disciplines` and verify exit 0; on failure or no, leave the AGENTS.md footnote as the activation path
- [ ] 3.4 If present: skip the prompt (idempotent re-run)
- [ ] 3.5 State explicitly that the install is user-global (writes `~/.pi/agent/settings.json`), not project-local, and never forced

## 4. Preview honesty

- [ ] 4.1 Add a line to `## Step 3 — Preview the planned writes, then confirm` noting the possible global `pi install` side effect (not a file write) so it is disclosed before confirmation

## 5. Verification

- [ ] 5.1 `openspec validate bundle-disciplines-in-project-init` exits 0
- [ ] 5.2 Dry-run the coding profile against a bare temp dir on a machine WITHOUT the global package: confirm the prompt appears, yes → install runs, resulting AGENTS.md table is live
- [ ] 5.3 Dry-run on a machine WITH the global package: confirm the step skips the prompt (idempotent)
- [ ] 5.4 Dry-run declining the install: confirm AGENTS.md still written with the doctrine + activation footnote, init completes cleanly
- [ ] 5.5 Confirm `git diff` touches only the two project-init files (template + SKILL.md); no code, no dependency, no change to `eng-disciplines`
