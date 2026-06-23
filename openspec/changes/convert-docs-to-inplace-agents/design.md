# Design — In-place AGENTS.md tree (DOX)

## 1. The decisive constraint: how pi loads AGENTS.md

Verified against pi docs (`README.md` "Context Files", `quickstart.md`):

```
Pi loads AGENTS.md (concatenated) from:
   ~/.pi/agent/AGENTS.md        (global)
   parent dirs (walking UP from cwd)
   current dir
   ──────────────────────────────────
   ✗ does NOT descend into child directories
```

Implications:

- Dashboard sessions run from the **repo root** → only root `AGENTS.md` auto-loads.
  All child AGENTS.md are **read-on-demand** by the agent. This is identical to the
  status quo, where subagents harvest a split on demand — neither bloats root context.
- DOX never assumed eager child loading; its mechanism is the agent **walking the tree
  root→area and reading each AGENTS.md before editing**. That is harness-agnostic and
  works under pi's load model.
- **Bonus:** a session started with `cwd` inside a package (e.g. `cd packages/web && pi`)
  auto-loads root + every ancestor AGENTS.md down to that dir — free scoped context the
  current split model never provides.

Conclusion: the conversion is sound under pi. The new failure mode (agent forgets to
walk the tree → edits blind) is the *same class* as today's failure mode (agent forgets
the far-off split exists). DOX's locality makes the correct ritual more natural: you are
already in the directory whose AGENTS.md you must read/update.

## 2. Placement granularity (chosen: per meaningful sub-area)

The tree has **533 directories** under `packages/` (excl. node_modules/dist/.pi) and
**719 documented file rows**. Three options were weighed:

| Option | Files | Verdict |
|---|---|---|
| Per top-level package only (~19) | few | Too coarse — recreates big monolithic AGENTS.md per package (web alone is huge). Rejected. |
| **Per meaningful sub-area (~20–50)** | medium | **Chosen.** Real locality; each AGENTS.md stays small; matches DOX "specific areas". |
| One per directory (533) | many | Doc sprawl, mostly trivial/empty files. Rejected. |

**Placement heuristic (deterministic, applied during migration):**

1. Every top-level package that has documented files gets a package-root `AGENTS.md`.
2. Push an AGENTS.md **deeper** into a subdir only when BOTH hold:
   - the subdir is a coherent concern (e.g. `components/`, `hooks/`, `lib/`,
     `routes/`, `tool-renderers/`), AND
   - it owns enough documented files (rule of thumb **≥ ~10 rows**, or ≥ ~5 rows when
     the parent would otherwise exceed ~40 rows).
3. Files in dirs below the deepest AGENTS.md are documented by the **nearest ancestor**
   AGENTS.md (rows may use a relative subpath in the path column).
4. Target: no single AGENTS.md exceeds ~40–50 rows; if it would, split a sub-area out.

This keeps each file small while bounding the file count to the chosen ~20–50 band.

## 3. File shapes

### Root `AGENTS.md`
- Global rules (commands, conventions, subagent routing, OpenSpec conventions, build
  matrix) — largely as today, minus the two index protocols.
- **DOX tree protocol** (replaces Documentation Update + Investigation protocols).
- **Top-level pointer map**: area → path of the area's AGENTS.md (an index *of indexes*,
  not of files). Example row: `web client → packages/web/src/AGENTS.md`.
- **No per-file index.**

### Child `AGENTS.md` (per sub-area)
- Optional 1–3 lines of local rules/conventions specific to the area.
- **Per-file index table** — same schema and caveman style as today's split rows:
  `` | `<path>` | <purpose> | `` one row per documented file, path-alphabetical.
  Purpose carries summary + key exports + invariants + `See change: <id>` annotations.
- A pointer line to any deeper child AGENTS.md (so the walk continues).

### Companion `<filename>.agent.md` (large-file escape hatch)
- Created only when a source file is **large** — gated on the source file's own size/LOC
  (plus long contract / many invariants / change history) such that inlining its detail
  would bloat the directory AGENTS.md. Small files stay inline as ordinary rows.
- Lives as a **sibling** of the source file: `Foo.tsx` → `Foo.agent.md`. The `.agent.md`
  suffix avoids collision with genuine user docs (e.g. a component `Foo.md` README).
- The directory AGENTS.md row for that file is a **one-liner + link**:
  `` | `Foo.tsx` | <one-line>. Detail: [Foo.agent.md](./Foo.agent.md) | ``.
- Caveman style applies to the companion doc body too.

## 4. The DOX tree protocol (replaces both current protocols)

```
BEFORE editing a file at <path>:
  walk root AGENTS.md → each ancestor AGENTS.md → the nearest AGENTS.md to <path>;
  read the local rules + the file's row (+ its companion .md if linked).

AFTER a meaningful change:
  update the nearest AGENTS.md (row purpose, new row, or new companion .md).
  new file        → add a row to the nearest AGENTS.md (alphabetical).
  large new file  → add a companion <file>.md + a one-line linking row.
  new sub-area    → create a child AGENTS.md + add a pointer from the parent + root map.

For "where is X" / cross-area sweeps:
  delegate to a subagent: `find . -name AGENTS.md` then grep the tree; return the
  ≤10 relevant rows. (Replaces "subagent reads docs/file-index-<area>.md".)
```

Caveman style (short fragments, drop articles/copulas, one fact per row, concrete
tokens) is **preserved verbatim** for all AGENTS.md rows and companion docs.

## 5. Migration mechanics (719 rows → AGENTS.md tree)

Each existing split row already carries its file path, so bucketing is mechanical:

1. **Parse** all 8 splits into `(path, purpose)` records (719 total).
2. **Bucket** records by their target AGENTS.md per the §2 heuristic (group by dir,
   roll up sparse dirs to the nearest qualifying ancestor).
3. **Per area, delegate to a subagent** (Explore/general): write each bucket's
   `AGENTS.md` with the rows verbatim (purposes already caveman-style), create companion
   `<file>.md` for any oversized single-file entry, and record the package-root pointer.
4. **Build the root top-level pointer map** from the set of created AGENTS.md paths.
5. **Fix drift**: rewrite any `src/<area>/` path tokens to `packages/<area>/` while
   bucketing (verify each rewritten path exists).
6. **Delete** `docs/file-index.md` + 7 splits.
7. **Update references** (5 files) to point at the DOX protocol instead of the splits.

Subagents doing `docs/`-adjacent writes get the caveman-style rule passed verbatim
(per the repo's existing Documentation Update Protocol discipline, which this change
otherwise retires).

## 6. Interaction with context-mode / Investigation Protocol

- The splits were grepped/harvested by subagents and indexable by context-mode. In-place
  AGENTS.md remain fully indexable; `find . -name AGENTS.md` enumerates the corpus.
- The Investigation Protocol's "pick the split → delegate harvest" becomes "read the
  local AGENTS.md along the edit path" — usually a single small file, cheaper than
  loading a 118 KB split. Subagent harvest is retained only for cross-area sweeps.

## 7. Alternatives considered

- **Keep splits, just shrink client/server** — treats the symptom (size), not the
  cause (locality + drift). Rejected.
- **Single root AGENTS.md with the full inline index** — literally "all index in
  AGENTS.md", but reintroduces the 107 KB balloon. Rejected (contradicts "avoid large
  AGENTS.md").
- **Generated AGENTS.md from a manifest** — adds a build step/runtime; DOX's value is
  zero-tooling plain Markdown the agent maintains in place. Deferred/rejected.

## 8. Risks

- **Walk-the-tree discipline.** If the agent skips the walk, it edits blind. Mitigation:
  explicit, prominent root rule; locality makes the ritual natural; verification step
  greps for coverage.
- **Coverage gaps during migration.** A row could be dropped. Mitigation: assert
  `count(rows in all AGENTS.md) ≥ 719` post-migration; diff path sets old vs new.
- **Reference rot.** External skills/docs still pointing at splits. Mitigation: the
  5-file reference-update task + a final grep for `file-index` returning zero hits.
- **Deeply-nested cwd concatenation.** A scoped session deep in the tree concatenates
  several ancestor AGENTS.md. Bounded by depth and each file is small; acceptable.

## 8b. Auto-update enforcement (deferred to KB Phase-2 hook)

The user's "plugin that injects DOX instructions + handles auto-update" decomposes
into three layers; only the third needs code:

- **Content** = the AGENTS.md tree (this change). Files must exist; a plugin cannot
  replace them, only maintain them.
- **Protocol** = the DOX rules. Home: root `AGENTS.md` (this repo) and/or
  `~/.pi/agent/AGENTS.md` (portable, every repo) — zero runtime. Static-instruction
  injection does not justify a plugin.
- **Enforcement** = react to a *source* edit, detect a stale/missing nearest-AGENTS.md
  row, nudge. This is the only part that needs an extension, and it is **folded into
  `add-markdown-knowledge-base`'s Phase-2 `tool_result` hook** (one hook, two jobs:
  KB reindex + DOX row enforcement; `doxEnforcement` default OFF) rather than a new
  competing extension. pi hook surface confirmed: `before_agent_start` (append
  systemPrompt), `tool_result` (`event.toolName`, `event.input.path`). Push nudges
  stay bounded/deduped/opt-in (the repo's push-is-an-anti-pattern caveat, KB R §5.3).
  Row *content* authoring stays with the LLM; the hook only detects + nudges.

This change therefore stays runtime-free and ships standalone; enforcement is a
graceful, optional enhancement layered on later via the KB extension.

### Cold start — a treeless project (A+B+C)

Opening a project with **no** `AGENTS.md` splits the same three layers:

- **Indexing works regardless** — the KB indexes markdown over its configured
  roots without needing any `AGENTS.md`; `fallbackManifest` synthesizes a routing
  map when no tree exists (KB §6d). No tree required to search.
- **(A) Protocol availability** — put the DOX rules in the **global**
  `~/.pi/agent/AGENTS.md` (loads in every pi session, every project). A fresh
  project then has the protocol even with zero project `AGENTS.md`, and the agent
  offers to initialize a tree. Zero code; this is the portable home for the rules
  (the repo's root `AGENTS.md` carries the same protocol for this repo).
- **(B) `kb dox init`** — one command scaffolds the tree from nothing, consuming
  **this design's §2 placement heuristic** as its contract (package-root file
  always; deeper sub-area at ≥~10 rows; cap ~40–50 rows/file). Deterministic
  placement; path columns seeded; purposes left for the LLM. Idempotent +
  `--dry-run`. Lives in `add-markdown-knowledge-base` (KB §6d(4)/§8.1).
- **(C) Cold-start nudge** — when `doxEnforcement` is on and a source file is
  edited in a project with no `AGENTS.md` on the path, the Job-2 nudge points at
  `kb dox init` rather than naming a row (KB §8.2). Ties A→B together.

§2 is the shared contract: this change *defines* the placement heuristic; `kb dox
init` *consumes* it. Keep them in sync if either moves.

## 9. Resolved decisions

- **Companion doc naming — RESOLVED:** `<file>.agent.md`, created **only for large source
  files** (gated on the source file's own size/LOC where a companion makes sense). The
  `.agent.md` suffix is collision-free against user docs. Small files stay inline.
- **Threshold tuning — RESOLVED (keep heuristic):** the ≥10-row push-deeper rule stands
  as the starting heuristic; per-area tuning happens during migration against the real
  distribution (client 246, server 147, plugins 89, shared 80, extension 57, electron 48,
  skills-misc 32, docker 20).
- **Root manifest — RESOLVED (pointer map only):** root keeps the area→AGENTS.md pointer
  map; no generated `find`-listing manifest. `find . -name AGENTS.md` covers grep needs.
