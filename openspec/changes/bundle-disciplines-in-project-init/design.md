# Design — bundle-disciplines-in-project-init

## Delivery choice: global install (A), not vendor-copy (B)

| | A. Global install (chosen) | B. Vendor-copy (rejected) |
|---|---|---|
| Skill location | `~/.pi/agent/npm/node_modules/…` via `pi install` | copied into each project's `.pi/skills/` |
| Stack safety | no footprint in the scaffolded repo (Rust/Go/Python fine) | markdown-only, also stack-safe |
| Drift | one source of truth; `pi update` refreshes | N copies age independently |
| Cost | one prompt at init; nothing per-project | bytes + files in every new repo |
| Reach | all projects on the machine, not just the scaffolded one | only the scaffolded project |

Global install wins on drift and reach. The only thing it needs that B does not is a **published package** — handled as a prerequisite (below).

## The init-time flow

```
project-init, coding profile, AFTER Step 4 (write scaffold):
  detect ─ pi list | grep pi-dashboard-eng-disciplines
           (or stat ~/.pi/agent/npm/node_modules/@blackbelt-technology/pi-dashboard-eng-disciplines)
    │
    ├─ PRESENT ─▶ done (skills already global; AGENTS.md table is live)
    │
    └─ ABSENT ─▶ ask_user(confirm):
                  "Install discipline skills globally? Powers the checkpoint
                   table this project uses; available in ALL projects."
                   ├─ yes ─▶ pi install npm:@blackbelt-technology/pi-dashboard-eng-disciplines
                   │         └─ verify exit 0; on failure, fall through to the decline note
                   └─ no  ─▶ leave AGENTS.md "activate later: pi install …" note in place
```

Detection is cheap and read-only; the install is the only side effect and is always behind an explicit `ask_user`. The step is **gated to the `coding` profile** — the same gating pattern the existing `Step 5 — DOX doctrine seed (only when the profile has dox: true)` already uses, so it fits the skill's structure without a schema change.

## Preview honesty (Step 3)

`project-init` Step 3 previews all planned writes before confirmation. The install is a machine-global side effect, not a file write, so it MUST be surfaced there explicitly: "May offer to `pi install …` globally if discipline skills are missing." This keeps the "only write/act after the user agrees" contract the skill opens with.

## Graceful degradation is the safety net

Decline (or an install failure) must never leave a broken project. The AGENTS.md doctrine block is written **unconditionally**; when the skills are absent it carries a one-line footnote:

> Discipline skills not detected — run `pi install npm:@blackbelt-technology/pi-dashboard-eng-disciplines` to activate the checkpoints above.

So the worst case is Option C (doctrine-only, aspirational), not dead references that look wired but aren't.

## Prerequisite: publication

`pi install npm:…` resolves against the npm registry. If `@blackbelt-technology/pi-dashboard-eng-disciplines` is not published, the install step fails at init time for real users. Therefore:

- A blocking task verifies `npm view @blackbelt-technology/pi-dashboard-eng-disciplines version` returns a version.
- That published version SHOULD be the one that includes `systematic-debugging` + `node-inspect-debugger` (from `add-debugging-skills`), so the checkpoint table's last two rows resolve to real skills. If publication happens before `add-debugging-skills` lands, those two rows carry the same "pending" footnote used in `wire-discipline-skills-into-openspec`.

## Alternatives considered

- **Vendor-copy (B)** — rejected for drift + per-project bloat (table above).
- **Force-install without asking** — rejected: the skill's contract is "act only after the user agrees"; a global machine mutation must be opt-in.
- **Project-local install (`pi install -l`)** — rejected as the default: writes the package into the scaffolded project's settings, reintroducing a per-project footprint (and, for Node repos, a settings entry the team must trust). Global is the cleaner default; a user who wants project-local can decline and install manually.
- **Bake the install into the `worktreeInit` hook** — rejected: `worktreeInit` runs per worktree and is stack-install oriented (`npm ci` etc.); a one-time global skill install does not belong in a per-worktree dependency gate.

## Risks

- **Package not yet published** — mitigated by the blocking verification task; until then the step no-ops to the decline note.
- **`pi` not on PATH during a dashboard-spawned init session** — detection/install should tolerate a missing `pi` binary (skip + footnote) rather than erroring the whole init.
- **Version skew** — if the global install predates `add-debugging-skills`, two table rows are pending; the footnote pattern already handles this without a broken reference.
