# Convert centralized file-index to in-place AGENTS.md tree (DOX)

> Design rationale, pi load-semantics analysis, migration mechanics: [`design.md`](./design.md).
> Implementation breakdown: [`tasks.md`](./tasks.md).
> Capability delta: [`specs/documentation-index/spec.md`](./specs/documentation-index/spec.md).

## Why

Today every architecturally significant file is documented in a **centralized
index**: `docs/file-index.md` (master) → 8 area splits
(`docs/file-index-<area>.md`). Current scale:

- **719 file rows, ~365 KB** across 8 splits.
- The biggest unit, `docs/file-index-client.md`, is **118 KB / 246 rows** — itself
  too large to load or grep comfortably; `file-index-server.md` is 82 KB / 147 rows.
- `AGENTS.md` explicitly **forbids** any per-file index (it ballooned to 107 KB once)
  and routes all per-file detail to the splits via the "Documentation Update Protocol".
- Discovery requires the "Investigation Protocol": a subagent reads a whole split and
  returns 5–10 rows.

Three structural problems:

1. **Docs live far from code.** Editing `packages/web/.../Foo.tsx` requires
   remembering to open and update a row in a distant 118 KB split. High drift risk —
   and `AGENTS.md` already drifted: it references `src/extension/`, `src/server/`,
   `src/client/`, `src/shared/` while the tree is `packages/*` (no `src/` dir exists).
2. **Monolithic splits.** A 118 KB / 246-row split is the same load/grep problem the
   original AGENTS.md had, just relocated.
3. **No edit-time locality.** The agent must context-switch to a far file to learn
   local rules, instead of reading docs that sit beside the code it touches.

[agent0ai/dox](https://github.com/agent0ai/dox) is a tiny AGENTS.md convention that
solves exactly this: a **hierarchy of AGENTS.md** files — root holds project-wide
rules + a top-level index; child AGENTS.md hold local rules + a local index; the
agent walks the tree root→area before editing and updates the nearest AGENTS.md after.

**Pivotal harness fact (verified):** pi loads AGENTS.md from
`~/.pi/agent/AGENTS.md`, **parent directories (walking up from cwd), and the current
directory** — it does **NOT** descend into child directories. Dashboard sessions run
from the repo root, so child AGENTS.md are **read-on-demand**, exactly like today's
splits (which subagents harvest on demand). Neither model bloats root context — they
differ only in *where per-file detail lives and how the agent finds it*. DOX wins on
locality and drift-resistance, and kills the 118 KB monster split.

## What Changes

Replace the centralized `docs/file-index*.md` mechanism with a **distributed in-place
AGENTS.md tree** (pure DOX): per-meaningful-sub-area AGENTS.md (~20–50 files),
co-located with the code they describe.

- **Root `AGENTS.md`** keeps global rules + a **top-level pointer map** (area → path of
  the area's AGENTS.md). It holds **no per-file index**.
- **Child `AGENTS.md`** at meaningful sub-area boundaries (e.g.
  `packages/web/src/components/AGENTS.md`, `.../hooks/`, `.../lib/`) carry local
  rules + the per-file index for files in that scope, in caveman style.
- **Large-source-file escape hatch:** when a source file is large enough that its
  documentation would bloat the directory AGENTS.md (gated on the source file's own
  size/LOC, plus long contract / many invariants / change history), give it a sibling
  companion `<filename>.agent.md`; the directory's AGENTS.md row links to it with a
  one-line summary — keeping the directory AGENTS.md lean. This is the user's "large
  file → file-based md" rule. Small files stay inline as ordinary rows.
- **Protocol rewrite:** the "Documentation Update Protocol" + "Investigation Protocol
  (Index First)" in `AGENTS.md` are replaced by a **DOX tree protocol**: *walk
  root→area reading each AGENTS.md before editing; update the nearest AGENTS.md after
  meaningful change.* Caveman row style is preserved.
- **Delete** `docs/file-index.md` and all 8 `docs/file-index-<area>.md` splits after
  migrating their 719 rows into the AGENTS.md tree.
- **Fix the `src/*` → `packages/*` drift** during migration.
- **Update references** to the old splits in: `.pi/skills/faq-mine/SKILL.md`,
  `.pi/skills/debug-dashboard/references/test-failure-triage.md`,
  `.pi/skills/ci-troubleshoot/references/common-failures.md`, `docs/faq.md`, `README.md`.

## Capabilities

### Added Capabilities

- `documentation-index`: distributed in-place AGENTS.md documentation tree (DOX) —
  per-sub-area AGENTS.md as the canonical per-file record, large-file companion docs,
  walk-the-tree-before-edit + update-nearest-after protocol, root top-level pointer map.

## Impact

- **AGENTS.md (root)** rewritten: drop "Documentation Update Protocol" and
  "Investigation Protocol — Index First"; add the DOX tree protocol + top-level pointer
  map. Net root size should shrink or hold (no per-file index either way).
- **~20–50 new `AGENTS.md` files** created under `packages/*` (and other documented
  trees); an unknown number of companion `<file>.md` docs for large files.
- **8 deleted files**: `docs/file-index.md` + 7 area splits (~365 KB removed from `docs/`).
- **5 reference updates**: faq-mine SKILL, debug-dashboard ref, ci-troubleshoot ref,
  `docs/faq.md`, `README.md` (small edits; `file-index` mention counts: AGENTS.md 15,
  faq-mine 2, others 1 each).
- **Subagent routing** ("Explore harvests a split") changes to "read the local
  AGENTS.md along the path" — often cheaper (one small local file vs a 118 KB split);
  subagents still useful for cross-area sweeps via `find . -name AGENTS.md`.
- **No application code changes.** Pure documentation-system + agent-protocol change.
- **Migration is the cost**: 719 rows re-bucketed from 8 area files into N directory
  files. Mechanizable (rows carry their path); per-area work delegated to subagents
  with the caveman-style rule passed verbatim.

## Non-goals

- **No application/source code changes** — docs + protocol only.
- **No one-AGENTS.md-per-directory** (533 dirs) — placement is per *meaningful
  sub-area* only; empty/trivial dirs inherit the nearest ancestor AGENTS.md.
- **No reliance on pi auto-loading child AGENTS.md** — pi does not descend; the
  walk-the-tree ritual (agent reads them on demand) is the mechanism, harness-agnostic.
- **No change to the caveman writing style** for doc rows — it carries over verbatim.
- **No automated generator/runtime** — DOX is plain Markdown maintained by the agent;
  this change does not add a build step or tool. The content (AGENTS.md tree) and
  protocol stay runtime-free so they ship and work standalone.
- **No auto-update enforcement extension here** — the optional "detect stale/missing
  AGENTS.md row on a source edit and nudge" mechanism is **deferred to**
  `add-markdown-knowledge-base`'s Phase-2 `tool_result` hook (one hook, two jobs:
  KB reindex + DOX row enforcement, `doxEnforcement` default OFF). See that change
  §6d(3) / §8.2 and its "Background reindex and DOX row enforcement (Phase 2)"
  requirement. This change does not depend on that extension; the tree + protocol
  degrade gracefully without it (pi still loads root `AGENTS.md`).
- **No cold-start bootstrapper here** — scaffolding a tree on a project that has
  none is handled by (A) the portable DOX protocol in global `~/.pi/agent/AGENTS.md`
  (agent offers to init; zero code), (B) `kb dox init` in `add-markdown-knowledge-base`
  (one command, consumes this change's §2 placement heuristic), and (C) the KB
  hook's treeless nudge. Indexing already works with zero `AGENTS.md`. See design §8b.
