# Add a Tier-2 LLM semantic-annotation plane to the knowledge base

> Scope note: the shipped Tier-1 knowledge graph is **deterministic and
> zero-LLM** — every KG requirement in `markdown-knowledge-base` states *"No LLM
> extraction SHALL be performed."* This change does **not** relax that. It adds a
> **separate, opt-in, write-time enrichment pass** whose only output is
> reviewable frontmatter. The indexer keeps building the graph deterministically
> from frontmatter; the LLM never runs inside it. Frontmatter is the contract
> between the two planes.

## Why

The Tier-1 graph derives edges from structure it can see for free: heading
nesting (`child_of`), `[[wikilinks]]` (`links_to`), markdown links
(`references`), and `frontmatter.tags` (`has_tag`). The `nodes.type` union
already declares an **`entity`** kind and `edges.rel` is a free-text column — but
nothing populates typed entities or typed relations today. The graph therefore
cannot answer questions that need *typed* joins/traversal:

- "Every doc that **`dependsOn`** component X" — `references` cannot say *why* one
  doc points at another.
- "Concepts **broader than** X, and the docs about them" — no SKOS concept graph.
- "All docs **authored by** person P across the repo" — no entity join.

The only way to populate that at scale, over prose that carries no structured
markup, is to *read the content* — which a deterministic parser cannot do. An LLM
can. The risk is that LLM extraction is noisy and non-deterministic, and the KB's
whole design DNA is "single SQLite file, no server, zero tokens, reproducible
reindex." So the LLM must be quarantined **upstream of the frontmatter**, never
inside the graph builder, and its output must land as a reviewable git diff
before it becomes graph truth.

This change adds that quarantined plane, hosted inside the `kb` plugin
(`packages/kb`), open-world (the annotator may propose new vocabulary, which
lands in a review queue rather than the graph), with a provenance/regen protocol
that keeps machine-authored frontmatter separate from human intent and
idempotent across re-runs.

## What Changes

- **Two-plane split, frontmatter as contract.** A new **enrichment plane** (LLM,
  write-time, opt-in, batched, `@fast`) reads document body content, classifies
  it against an ontology, and writes a machine-managed `kb:` frontmatter block.
  The existing **indexing plane** (deterministic, zero-LLM) is extended to emit
  `entity` nodes and typed edges **from that block** — it still never calls an
  LLM.

- **New CLI surface in the kb plugin.**
  - `kb annotate [paths…]` — the enrichment pass. Hash-gated (only changed
    files), ontology-guided, writes/merges the `kb:` block. Requires trust +
    explicit opt-in (config `annotation.enabled`); no-op otherwise.
  - `kb ontology …` — manage the controlled vocabulary and the open-world review
    queue (`review`, `promote <curie>`, `reject <curie>`, `show`).

- **Ontology binding (schema.org core + SKOS subset).** A vendored static
  vocabulary subset ships in the package. A project ontology file
  (`.pi/dashboard/kb-ontology/ontology.json`) declares the allowed entity **types**
  and relation **predicates** (as CURIEs), plus an alias map for normalization.
  The annotator is *constrained* to this vocabulary; the deterministic validator
  enforces it. schema.org supplies concrete entity kinds (Person, Organization,
  SoftwareSourceCode…); SKOS supplies the topical concept graph
  (`skos:broader` / `skos:related`) that is the highest-value slice for a docs KB.

- **Open-world extraction with a review queue (not silent growth).** The
  annotator MAY propose entity types / predicates outside the current ontology.
  Proposed items are written with `status: proposed` **and** mirrored to
  `.pi/dashboard/kb-ontology/review-queue.jsonl` — they are **inert**: the indexer
  emits edges only for `status: approved` items. A curator runs
  `kb ontology promote`/`reject`; promotion flips matching proposed items to
  approved on the next (deterministic) index run. Open-world coverage without a
  self-poisoning graph.

- **Provenance + regen protocol.** The `kb:` block carries
  `annotator {model, ontologyVersion, contentHash, annotatedAt}` and, per item,
  `status`, `confidence`, `source (llm|human)`, `pinned?`. Re-annotation is
  hash-gated (unchanged body + unchanged ontologyVersion ⇒ skip, no LLM call) and
  **merge-preserving**: `source: human` / `pinned: true` items survive
  regeneration; only machine items are replaced. Human edits are never clobbered.

- **Determinism guardrails.** Indexer stays zero-LLM (unchanged invariant). The
  annotator runs at temperature 0 against a fixed structured-output schema,
  constrained by the ontology whitelist, hash-gated for idempotence, and gated by
  human review (git diff + `status: approved`). Three independent leashes on
  hallucination: vocabulary whitelist → deterministic validator → approval gate.

- **OKF v0.1 conformance + interop.** Annotated frontmatter conforms to the Open
  Knowledge Format (top-level non-empty `type` + standard `tags`/`timestamp`),
  carrying the typed graph under a `kb:` extension key OKF explicitly permits. KB
  docs thus form a valid OKF bundle readable by third-party OKF tooling (e.g.
  Google's static graph visualizer); conversely kb consumes external OKF bundles
  as an ordinary markdown source, recognizing the `index.md`/`log.md` reserved
  files. OKF is a strict base; our typed predicates + ontology are the extension
  superset. See design §9. (Grounded in `GoogleCloudPlatform/knowledge-catalog/okf/SPEC.md`.)

- **Search consumes typed edges.** `kb neighbors`/`kb backlinks` gain optional
  `--rel <curie>` filtering so callers can traverse a specific predicate
  (`dependsOn`, `skos:broader`) for reference-context expansion; graph expansion
  stays opt-in as today.

## Discipline Skills

- **security-hardening** — the annotator ingests untrusted document content and
  emits data that becomes graph truth; the trust/opt-in gate, the review-queue
  quarantine, and the "approved-only" indexer emission are the security boundary.
- **doubt-driven-review** — the two-plane invariant boundary (LLM upstream of
  frontmatter, never in the indexer) and the regen/merge protocol are
  irreversible-ish design commitments; stress-test them before they stand.
- **observability-instrumentation** — annotation runs (files touched, tokens,
  proposed-vs-approved counts, skip-on-hash) need to be visible to justify cost
  and catch drift.
- **performance-optimization** — batched fan-out over potentially hundreds of
  files on a budget; hash-gating and changed-files-only scoping are the perf
  contract.

## Capabilities

### New Capabilities
- `kb-semantic-annotation` — the enrichment plane, ontology binding, open-world
  review queue, provenance/regen protocol, and the typed-entity/typed-edge graph
  emission the indexer performs from the `kb:` block.

### Modified Capabilities
- `markdown-knowledge-base` — the Tier-1 graph requirement is clarified (not
  relaxed): "No LLM extraction in the indexer" is retained and scoped; typed
  `entity` nodes and typed edges are added to the graph model, sourced
  deterministically from the machine-managed `kb:` frontmatter block.

## Impact

- **New**: `packages/kb/src/annotator.ts`, `packages/kb/src/ontology.ts`,
  vendored `packages/kb/ontology/{schema-core,skos}.json`, a `kb-annotate` SKILL
  under `packages/kb/skill/`, config schema additions
  (`annotation`, `ontology` blocks in `knowledge_base.json`).
- **Modified**: `indexer.ts` (emit `entity` nodes + typed edges from `kb:`,
  approved-only), `types.ts` (widen `GraphNode.type` usage + `GraphEdge.rel` to
  CURIE predicates; add annotation types), `cli.ts` (`annotate`, `ontology`
  subcommands, `neighbors --rel`), `chunker.ts` (surface the full `kb:` block, not
  just `tags`).
- **Unchanged invariant**: the indexer performs no LLM/embedding calls. The
  Phase-2 reindex extension and `kb dox` tooling are untouched.
- **Opt-in**: with `annotation.enabled` unset, `kb annotate` is a no-op and the
  indexer behaves exactly as today (no `kb:` blocks to read).
