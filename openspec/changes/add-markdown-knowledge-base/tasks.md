# Tasks — Markdown Knowledge Base

Refs: [`proposal.md`](./proposal.md), [`design.md`](./design.md),
[`research.md`](./research.md). Verify against `doc-example/` (691 md).

## Phase-1 implementation status (2026-06-23)

**Working vertical slice landed at `packages/kb/`** (isolated; NOT yet wired into
root workspace/release pipeline — zero impact on existing build). Binding =
**`node:sqlite`** (zero deps; supersedes better-sqlite3 — design §9.1).

Built + verified against real `doc-example/` (691 files → 6,541 chunks, cold
index ~4.6s, **incremental no-op reindex 29ms**, search P@1 0.75 / Recall@10
1.00 / MRR 0.82, dedup collapses with `akaPaths`, graph neighbors+backlinks):
- `src/types.ts` — KbStore interface + types (§2.5)
- `src/chunker.ts` — structural heading chunker, fence-safe, wikilink/md-link/
  frontmatter extraction (§3) [line-based; mdast refinement deferred]
- `src/sqlite-store.ts` — SqliteFtsStore: FTS5 + BM25F + snippet + dedup +
  files + nodes/edges + recursive-CTE neighbors/backlinks (§2, §6c)
- `src/indexer.ts` — walk + mtime→sha256 incremental + Tier-1 graph + txn (§5)
- `src/config.ts` — project→global→defaults layering, legacy `roots[]` alias,
  no file cap default (§1, §7)
- `src/cli.ts` — `kb init|index|search|neighbors|backlinks|get|config`; `--json`,
  `--doc-type`, `--root`, `--limit`, `--no-reindex`, ad-hoc `--source`/`--db`;
  auto incremental reindex before search (§5.1, §8.1)
- `src/init.ts` — `kb init`: scaffold + validate `knowledge_base.json`
  (project/`--global`), seed defaults + `sources[]`, gitignore `dbPath`,
  no-clobber-without-`--force`, `--dry-run` (§5.7, design §7/§8.1)
- `src/eval.ts` + `eval/golden.doc-example*.json` — `kb eval` golden harness:
  P@1/P@5/Recall@K/MRR/nDCG@K; normal + paraphrase sets (§4b.7, Tier E)
- `skill/kb-search/SKILL.md` — packaged kb-search SKILL: trigger-shaped
  description + retrieve-then-iterate procedure (§5.3; isolated in package, not
  activated in repo `.pi/skills` until installed)
- `skill/kb-setup/SKILL.md` — packaged kb-setup SKILL: trigger-shaped setup
  description + bring-up procedure wrapping `kb init` → trust → index → smoke
  search (§5.8; isolated in package, not activated until installed)
- `verify.ts` (runnable) + `src/__tests__/kb.test.ts` (**13 vitest tests pass**:
  chunker, indexer incremental edit/delete, dedup, graph, config layering, eval)

CLI verified vs `doc-example/`: `kb index` 691 files; `kb search` breadcrumbed
sections + highlighted snippets + dedup `(+N dup)`; **`kb eval` reproduces
research §2.5 numbers exactly** (normal P@1 0.80 / P@5 0.95 / nDCG 0.876;
paraphrase Recall 0.11 — the lexical ceiling).

Deferred (later Phase-1/2 passes): mdast parser, sources npm/git/https +
trust/pin/refresh (§1c), trigram companion, rerank/PRF/MMR/proximity
(§4b.1-6), agents-md/directory-level (§2b), Phase-2 tool+hook (§6), build step
(dist) + release wiring (§7.5).

Note: graph heading-nodes keyed by breadcrumb collide across files with
identical heading structure (acceptable Phase-1; consider path-scoping later).

## 0. Design sign-off (blocking)

- [x] 0.1 Open questions resolved — see [`design.md`](./design.md) §9:
      TS + **`node:sqlite`** (zero-dep, FTS5 verified; better-sqlite3 fallback) +
      remark; **publishable package** `packages/kb`;
      global config `~/.pi/dashboard/knowledge_base.json`; **one DB per project**
      at `.pi/dashboard/kb/index.db` (cross-root dedup); identity `(root,path)`
      + sha256 dedup; basename-first wikilinks w/ unresolved nodes;
      **both Phase 1 + Phase 2 in this change**.
- [ ] 0.2 RESOLVED: TS + `better-sqlite3` + `unified`/`remark` (R §7). Confirm
      `better-sqlite3` install + FTS5 present (context-mode `ctx_doctor` shows
      FTS5/SQLite PASS; mirror its `heal-better-sqlite3.mjs` rebuild script).
      Remaining: CLI packaging shape (design §9.1).

## 1. Config layer

- [ ] 1.1 Define `knowledge_base.json` schema (design §7) + validator.
- [ ] 1.2 Loader: project `.pi/dashboard/knowledge_base.json` → fallback global
      defaults; absent fields fill from global. **No file cap by default.**
- [ ] 1.3 Unit tests: project-only, global-only, neither (built-in defaults),
      partial project (field fill-in).

## 1b. Storage abstraction (KbStore)

- [ ] 1b.1 Define `KbStore` interface (design §2.5): indexing, graph, query,
      lifecycle methods + `KbHit` shape.
- [ ] 1b.2 Implement `SqliteFtsStore` (better-sqlite3 + FTS5) as default backend.
- [ ] 1b.3 Route all parser/chunker/graph/search/CLI access through `KbStore`
      (no direct SQL outside the store).
- [ ] 1b.4 Document `TursoFtsStore` as future backend (R §8): FTS5→`fts_*` API
      delta, `v1cc0/aimem` reference. NOT implemented in this change.
- [ ] 1b.5 Test: a no-op/in-memory `KbStore` double satisfies the interface
      (proves the boundary is real).

## 1c. Source resolution (pluggable sources)

- [ ] 1c.1 `SourceResolver` interface + `SourceSpec`/`ResolvedSource` types
      (design §6b). Generalize `roots[]` → `sources[]`; accept `roots[]` legacy
      alias. Reuse `parseSourceKind`/`computeIdentity` from
      `package-source-helpers` (R §8b).
- [ ] 1c.2 `filesystem` resolver (abs + project-relative).
- [ ] 1c.3 `npm` resolver: locate installed pkg dir
      (`~/.pi/agent/npm/node_modules` → `.pi/npm` → project `node_modules`),
      index README + `subdir`; optional install-if-missing.
- [ ] 1c.4 `git` resolver: clone/pull into `sourceCacheDir/<hash>`, checkout
      `pin`, index `subdir`; `kb index --refresh` reconciles ref.
- [ ] 1c.5 `https` resolver: fetch file/tarball into cache, expand, index.
- [ ] 1c.6 TOFU trust: prompt on first remote fetch; persist
      `~/.pi/dashboard/kb-source-trust.json` keyed by `sha256(canonical(spec))`
      (mirror `worktree-init-trust.ts`). Filesystem skips trust. Read-only: never
      execute source code.
- [ ] 1c.7 Pinning + refresh policy (`on-index`|`manual`|`{ttlMs}`) + cache mgmt.
- [ ] 1c.8 Tests: each resolver resolves to a local dir; remote dedup/priority
      matches local multi-root; untrusted remote blocks until trusted; pinned
      git reproducible.

## 2. Indexer core

- [ ] 2.1 Directory walk + include/exclude globs + gitignore + extensions
      (uncapped by default). (design §5)
- [ ] 2.2 Change detection: mtime → sha256 → reindex; deletion purge. (design §5)
- [ ] 2.3 Markdown parse: frontmatter, fenced-code state machine, ATX headings,
      wikilinks, markdown links. (design §3, §4)
- [ ] 2.4 Structural chunker: heading split, breadcrumb-in-body, tiny-merge,
      oversized leaf paragraph-split, flat-file fallback. (design §3)
- [ ] 2.5 DB schema create + migrations (chunks FTS5 [+trigram], files,
      nodes, edges, indexes; WAL). (design §2)
- [ ] 2.6 Transactional per-root reindex; `--force` full rebuild.
- [ ] 2.7 Tests vs `doc-example/`: `interceptors.md` chunk count/breadcrumbs,
      code fences intact, incremental edit/delete touches only changed file.

## 2b. AGENTS.md + source-md indexing & directory-level AGENTS (design §6d)

- [ ] 2b.1 `doc_type` column on chunks (`doc`|`agents`|`source-md`); set from
      filename/location during indexing.
- [ ] 2b.2 `indexAgentsFiles` (AGENTS.md/CLAUDE.md) + `includeSourceMarkdown`
      (source-tree `*.md`) config + include-glob wiring.
- [ ] 2b.3 `kb search --doc-type doc|agents|source-md` filter.
- [ ] 2b.4 OPT-IN (default OFF) `directoryLevelAgents`: `kb agents <path>` pull
      command returning root→nearest AGENTS.md chain (grounds the descendant gap
      in pi's up-walk, R §8d); `claudeMd` toggle.
- [ ] 2b.5 OPT-IN push mode: extension surfaces nearest AGENTS.md on `tool_call`
      touching a path (reuse the isolated extension; never bridge.ts). Default off.
- [ ] 2b.6 `fallbackManifest`: emit KB-generated routing manifest when no
      AGENTS.md on path (dox-pattern synthesis, R §8d).
- [ ] 2b.7 Tests: AGENTS.md indexed + tagged + filterable; `kb agents` returns
      correct chain; disabled by default; fallback manifest when none.

## 3. Graph (Tier-1)

- [ ] 3.1 Edge extraction in the parse pass: child_of, links_to, references,
      has_tag, frontmatter entities. (design §4)
- [ ] 3.2 Recursive-CTE traversal: `neighbors(node, depth, rel?)`,
      `backlinks(node)`. (design §4)
- [ ] 3.3 Dangling-edge prune on reindex/delete.
- [ ] 3.4 Tests vs `doc-example/`: section→parent-guide neighbors; README
      backlinks.

## 4. Search + dedup

- [ ] 4.1 BM25 query: `MATCH` + `bm25()` asc + `snippet()`; optional column
      weighting (heading boost). (design §2, R §1.1)
- [ ] 4.2 Exact-content collapse (body sha256) → `aka_paths`. (design §6)
- [ ] 4.3 Prefer-higher-priority-root suppression/demotion. (design §6)
- [ ] 4.4 Tests vs `doc-example/`: the 4 validated queries (R §2.2) land on the
      same correct sections; the previously-doubled hit returns once with the
      duplicate in `aka_paths`.

## 4b. Retrieval-quality pipeline (R §8c, design §6c)

- [ ] 4b.1 BM25F field weighting via FTS5 weighted `bm25()`
      (`ranking.fieldWeights`, heading breadcrumb > heading > body). Tier A.
- [ ] 4b.2 Proximity/in-order boost (`NEAR`/subsequence aux ranker),
      `ranking.proximityBoost`. Tier A.
- [ ] 4b.3 Lexical MMR diversity (token-overlap, no vectors),
      `ranking.diversity.{enabled,lambda}`. Tier A.
- [ ] 4b.4 Parent/child small-to-big return (`expand.parent`, `--expand-parent`)
      using `parent_chunk_id`/`child_of`; optional graph expansion
      (`expand.graph`, `--expand-graph`). Tier B.
- [ ] 4b.5 OPTIONAL (default OFF, flagged): cross-encoder rerank of BM25 top-k
      (`rerank.*`, `--rerank`) — optional model dep, NO vector index; lexical
      pipeline unchanged when off. Tier C.
- [ ] 4b.6 OPTIONAL (default OFF, flagged): query expansion
      (`queryExpansion.mode` = off|prf|synonym|agent, `--expand-query`). Tier C.
      Benchmark (R §2.5): expansion is the **primary paraphrase mitigation**
      (Recall@10 0.11→1.00); prefer agent reformulation or curated glossary;
      PRF + trigram gave no paraphrase lift — don't rely on them for it.
- [ ] 4b.7 `kb eval` golden-set harness: P@K, Recall@K, MRR, nDCG@K over a
      `query→expected-section` set built from `doc-example/` (incl. R §2.2/2.5
      queries). Ship **two** sets: normal + **HARD paraphrase** (disjoint
      vocabulary) to track the paraphrase ceiling. Tier E. Gate ranking changes.
      Seed from preserved prototype `prototype/bench.ts`+`bench2.ts` (R §2.5).
- [ ] 4b.8 Tests: heading match outranks body (BM25F); dedup frees top-N slots;
      parent returned with hit; `--rerank` no-ops cleanly without the model;
      eval reports metrics on both golden sets; paraphrase set improves with
      `queryExpansion` on.

## 5. Phase 1 delivery — CLI + SKILLs

- [ ] 5.1 CLI: `kb index|search|neighbors|backlinks|get` with `--json`,
      `--root`, `--limit`, `--depth`, `--force`, `--no-reindex`. (design §8.1)
- [ ] 5.2 `search` auto-runs incremental index unless `--no-reindex`. (R §1.2)
- [ ] 5.3 SKILL `.pi/skills/kb-search/SKILL.md` — trigger-shaped description +
      retrieve-then-iterate procedure + JSON-output contract. (R §5.3, design §8.1)
- [ ] 5.7 CLI `kb init [--global] [--source <ref>]... [--dry-run] [--force]`:
      scaffold + schema-validate `knowledge_base.json` (project default;
      `--global` → `~/.pi/dashboard/`); seed documented defaults + `sources[]`;
      ensure `dbPath` gitignored; refuse overwrite without `--force`; `--dry-run`
      prints + writes nothing. (design §7, §8.1)
- [ ] 5.8 SKILL `.pi/skills/kb-setup/SKILL.md` — trigger-shaped setup
      description ("set up the knowledge base"/"init kb config"/"index my docs");
      body wraps `kb init` → TOFU trust → `kb index` → smoke `kb search`. (design §8.1)
- [ ] 5.9 Tests: `kb init` writes valid config (project + `--global`); existing
      config not clobbered without `--force`; `--dry-run` writes nothing;
      `--source` seeds `sources[]`; `dbPath` added to gitignore.
- [ ] 5.4 Gitignore the DB path; document config in change docs (delegated
      `docs/` write, caveman style, per AGENTS.md protocol).
- [ ] 5.5 `kb dox init [--dry-run]`: scaffold an `AGENTS.md` tree via the
      placement heuristic (convert-docs §2); reuse the indexer walk + gitignore;
      seed each row's path, leave purposes for the LLM; idempotent (never clobber
      existing `AGENTS.md`, add only missing files/rows); `--dry-run` prints the
      plan. (design §6d(4), §8.1)
- [ ] 5.6 Tests: treeless project → tree created per heuristic; rerun does not
      clobber; `--dry-run` writes nothing.
- [ ] 5.10 `kb dox lint [--json] [--fix]`: deterministic DOX-tree audit (adapts
      karpathy gist "Lint" op). Report stale rows (source-hash drift, reuse
      Phase-2 sidecar + `files` sha256), orphan rows (path gone), missing rows
      (eligible source file, no row), missing `<file>.agent.md` companion
      (over threshold), broken pointer-map links, over-threshold areas. `--json`
      + non-zero exit on issues; `--fix` = deterministic subset only (prune
      orphans, add path-only rows), never authors purposes. No LLM/embedding.
      (design §6d(5), §8.1)
- [ ] 5.11 Tests: stale/orphan/missing row each detected + categorized; clean
      tree exits zero; `--json` shape; `--fix` prunes orphans + adds path-only
      rows without touching purposes; over-threshold area flagged.

## 6. Phase 2 delivery — native tool + reindex hook (may split to follow-up)

- [ ] 6.1 Verify `pi.on("tool_result")` exposed in installed pi
      (extensions.md Tool Events §672; retry-tracker caveat R §5.1).
- [ ] 6.2 `pi.registerTool` for `kb_search`/`kb_neighbors`/`kb_get` (typed
      schema, JSON return). (design §8.2)
- [ ] 6.3 Isolated standalone extension (image-fit precedent) hooking
      `tool_result` → debounced, hash-gated reindex on `.md` edits. **Not** in
      `src/extension/bridge.ts`. (R §5.2)
- [ ] 6.4 DOX row enforcement (Job 2 of the same hook, `doxEnforcement` default
      OFF, design §6d(3)/§8.2): on a non-`.md` source edit, locate nearest
      `AGENTS.md`; if no row for the path OR row's tracked source-hash stale,
      emit ONE bounded, deduped nudge (edited path + nearest AGENTS.md). Editing
      an `AGENTS.md` clears its rows' stale flags. Staleness store = sidecar
      `source-path → acknowledged-source-hash` (mirrors files-table sha256, §5).
      Hook does NOT auto-write row content — LLM authors via nudge / `kb agents`.
      Cold start: a source edit in a project with no `AGENTS.md` on the path →
      nudge points at `kb dox init` instead of naming a row (design §6d(4)/§8.2).
- [ ] 6.5 Tests: enforcement OFF → no nudge; stale/missing row → exactly one
      nudge; updating the row clears the flag (no repeat); AGENTS.md edit clears
      flags + reindexes; treeless edit → nudge names `kb dox init`.
- [ ] 6.6 Tests: edit a `.md` in a session → index reflects change without a
      manual `kb index`.

## 7. Verification + archive

- [ ] 7.1 Full verification suite (design §10) green against `doc-example/`.
- [ ] 7.2 `openspec validate add-markdown-knowledge-base` passes.
- [ ] 7.3 Add file-index rows for new files (delegated, caveman style).
- [ ] 7.4 Confirm no regression to context-mode usage (complementary, R §6).
- [ ] 7.5 Wire `packages/kb` into the release pipeline (7th published package):
      add to `npm publish -ws` set + `release-cut` version-bump list; gitignore
      `.pi/dashboard/kb/`.
