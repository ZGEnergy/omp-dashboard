# Tasks

## 1. Establish the protocol (root AGENTS.md)

- [ ] 1.1 In root `AGENTS.md`, replace the "Documentation Update Protocol" section with a
  **DOX tree protocol**: walk root→area reading each AGENTS.md before editing; after a
  meaningful change update the nearest AGENTS.md (row / new row / companion `.md` / new
  child AGENTS.md + parent pointer). Preserve the caveman-style rules verbatim.
- [ ] 1.2 Replace "Investigation Protocol — Index First" with "walk the AGENTS.md tree
  along the edit path"; cross-area sweeps delegate to a subagent running
  `find . -name AGENTS.md` + grep. Keep the "grep README/docs first for how-to/what-is"
  gate (it does not depend on file-index).
- [ ] 1.3 Add the **top-level pointer map** (area → AGENTS.md path) placeholder; fill in
  task 4 once child files exist.
- [ ] 1.4 Remove the "Key Files" / file-index pointers that referenced `docs/file-index*`.
- [ ] 1.5 Confirm root `AGENTS.md` carries **no per-file index** and did not grow.
- [ ] 1.6 Author a portable DOX protocol snippet (the walk/update rules + "offer
      `kb dox init` on a treeless project") suitable for dropping into global
      `~/.pi/agent/AGENTS.md` so any project gets DOX (design §8b, option A). Keep
      it identical in intent to the root-`AGENTS.md` protocol; place the snippet in
      this change folder (e.g. `dox-protocol.global.md`) for users to copy.

## 2. Define placement + bucket the 719 rows

- [ ] 2.1 Parse all 8 `docs/file-index-*.md` splits into `(path, purpose)` records;
  assert total == 719 (or record the real current count first).
- [ ] 2.2 Apply the §2 placement heuristic to assign each record a **target AGENTS.md
  path** (package root always; push deeper when subdir is a coherent concern AND
  ≥ ~10 rows; roll sparse dirs up to nearest qualifying ancestor; cap ~40–50 rows/file).
- [ ] 2.3 Rewrite any `src/<area>/` path tokens to `packages/<area>/`; verify each
  rewritten path exists on disk (drop/flag rows whose file no longer exists).
- [ ] 2.4 Produce the planned AGENTS.md file list (target ~20–50) and confirm the band;
  surface any AGENTS.md that would exceed the row cap for a manual sub-split decision.

## 3. Migrate (per area, delegated to subagents)

- [ ] 3.1 For each area split (client, server, shared, plugins, extension, electron,
  docker, skills-misc): delegate to a general-purpose/Explore subagent — write each
  bucket's `AGENTS.md` with rows verbatim (caveman style), path-alphabetical, plus 1–3
  lines of local rules where they exist. Pass the caveman-style rule verbatim.
- [ ] 3.2 For any **large** source file (gated on its own size/LOC, plus long contract /
  many invariants / change history), create a sibling `<file>.agent.md` companion and
  reduce the AGENTS.md row to a one-line summary + link. Small files stay inline as
  ordinary rows — do not create `.agent.md` for them.
- [ ] 3.3 Add a pointer line from each parent AGENTS.md to its deeper child AGENTS.md.
- [ ] 3.4 Record each created package-root AGENTS.md path for the root pointer map.

## 4. Wire the root pointer map

- [ ] 4.1 Populate the root `AGENTS.md` top-level pointer map from the set of created
  AGENTS.md (area → path). Pointers only; no file rows.

## 5. Update references to the old splits

- [ ] 5.1 `.pi/skills/faq-mine/SKILL.md` (2 mentions) — point at the DOX protocol / tree.
- [ ] 5.2 `.pi/skills/debug-dashboard/references/test-failure-triage.md` (1) — update.
- [ ] 5.3 `.pi/skills/ci-troubleshoot/references/common-failures.md` (1) — update.
- [ ] 5.4 `docs/faq.md` — update any file-index how-to entries to the DOX tree workflow
  (delegate the `docs/` write to a subagent with caveman style).
- [ ] 5.5 `README.md` — update project-structure / docs references to the DOX tree.

## 6. Delete the centralized index

- [ ] 6.1 Delete `docs/file-index.md` and all 7 `docs/file-index-<area>.md` splits.
- [ ] 6.2 Final grep: `grep -rn 'file-index' AGENTS.md README.md docs .pi` returns **zero**
  hits (outside this change folder).

## 7. Verify

- [ ] 7.1 Coverage: union of all paths in every AGENTS.md ⊇ the 719 migrated paths
  (minus any flagged-nonexistent in 2.3). No documented file lost.
- [ ] 7.2 Path-set diff old-vs-new prints no unexplained drops.
- [ ] 7.3 No AGENTS.md exceeds the ~40–50 row cap (re-split offenders).
- [ ] 7.4 `find . -name AGENTS.md -not -path '*/node_modules/*'` lists root + ~20–50
  children, each loadable/greppable.
- [ ] 7.5 Spot-check the walk: pick 3 files in different areas; confirm root→area walk
  reaches each file's row.
- [ ] 7.6 `openspec validate convert-docs-to-inplace-agents` passes.
