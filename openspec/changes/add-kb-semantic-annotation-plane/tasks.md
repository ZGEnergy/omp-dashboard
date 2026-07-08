# Tasks

## 1. Ontology binding (deterministic, no LLM)

- [ ] 1.1 Vendor MINIMAL corpus-grounded subsets (design §8): `schema-core.json`
      = **only** `schema:SoftwareSourceCode` + `schema:Person` (the two types the
      repo actually uses — do NOT import the schema.org catalog); `skos.json` =
      `Concept` + `broader`/`narrower`/`related`. Seed the repo-native `kb:`
      micro-vocab in the default `ontology.json`: types `kb:Component`,
      `kb:Package (⊑ schema:SoftwareSourceCode)`, `kb:Change`, `kb:Capability`,
      `kb:Requirement`; predicates + `source` extraction-tier + aliases exactly as
      design §8.3.
- [ ] 1.4 Tier-1a deterministic extractors (no LLM, live in the indexer, not the
      annotator): `See change: <id>` → `kb:changedBy`; `packages/<pkg>/` path →
      `kb:partOf`; openspec proposal capability headers + `specs/<cap>/` tree →
      `kb:realizes`. → verify: fixture with a `See change:` line + a package path
      emits both edges with zero model calls.
- [ ] 1.2 `ontology.ts`: load project `ontology.json`, merge imported vendored
      subsets, expose `isKnownType(curie)`, `isKnownPredicate(curie)`,
      `normalize(alias)→curie`. → verify: unit tests for membership + alias
      normalization + CURIE canonicalization.
- [ ] 1.3 Review-queue store: append-dedup proposed curies to
      `review-queue.jsonl`; `kb ontology review|promote|reject|show`. → verify:
      promote bumps `ontology.version`; reject records a stop-list entry.

## 2. Provenance + regen protocol (deterministic core, TDD-first)

- [ ] 2.1 Types: `KbAnnotationBlock`, `KbEntity`, `KbRelation`
      (`status`/`confidence`/`source`/`pinned`) in `types.ts`. Widen
      `GraphEdge.rel` to accept CURIE predicate strings.
- [ ] 2.2 `chunker.ts`: surface the FULL `kb:` block from frontmatter (today only
      `tags` is read). → verify: parse test round-trips the block.
- [ ] 2.3 Merge function (pure, no LLM): given existing items + validated
      candidates, keep `source:human`/`pinned`, replace `source:llm && !pinned`,
      classify unknown-vocab → `proposed`. → verify: unit tests for
      preserve-human, replace-machine, proposed-on-unknown.
- [ ] 2.4 Hash-gate: skip when `contentHash` matches body sha256 AND
      `ontologyVersion` unchanged. → verify: second annotate over unchanged file
      makes zero model calls (assert via injected fake model spy).

## 3. Enrichment plane — the annotator (the only LLM caller)

- [ ] 3.1 `annotator.ts`: `kb annotate [paths…]`. Opt-in gate
      (`annotation.enabled`) + trust-on-first-use; no-op when disabled. Scope to
      changed files by default, `--force` for all.
- [ ] 3.2 `@fast` subagent fan-out (mirror `migrate-runner.ts` batching):
      per-file prompt injects the ontology whitelist; temperature 0; fixed
      structured-output schema. → verify: prompt contains the whitelist; output
      parsed into candidate entities/relations.
- [ ] 3.3 Deterministic validator between model and disk: type/predicate ∈
      ontology → approved; unknown → proposed + review-queue; normalize aliases;
      drop malformed. → verify: known→approved, unknown→proposed, junk dropped.
- [ ] 3.4 Merge-preserving write of the `kb:` block with fresh annotator
      provenance. → verify: golden-file diff shows only machine items changed.

## 4. Indexing plane — emit typed graph (STILL zero-LLM)

- [ ] 4.1 `indexer.ts`: emit (a) Tier-1a deterministic edges (task 1.4) always,
      and (b) from the `kb:` block, `entity` nodes + typed edges for
      `status: approved` items **only** (proposed/rejected produce no edges).
      → verify: index of a file with mixed statuses yields edges for approved
      only, plus the deterministic Tier-1a edges regardless of annotation state.
- [ ] 4.2 Assert the invariant in a test: annotator disabled / no `kb:` block ⇒
      identical graph to today (no regression). → verify: existing kb graph tests
      still pass unchanged.
- [ ] 4.3 `kb neighbors|backlinks --rel <curie>`: scope traversal to one
      predicate. → verify: `--rel schema:dependsOn` returns only dependsOn hops.

## 4b. OKF conformance + interop (design §9)

- [ ] 4b.1 Producer: annotator writes top-level `type` (ontology CURIE) + standard
      `tags`/`timestamp` (`title`/`resource` when known); typed graph + provenance
      under the `kb:` extension key. → verify: output validates as OKF v0.1
      (non-empty top-level `type`) AND round-trips our `kb:` block.
- [ ] 4b.2 Consumer: indexer maps top-level OKF `type` → `entity` node; recognizes
      `index.md` (progressive disclosure) + `log.md` (history, feeding
      `kb:changedBy`); tolerates broken cross-links. → verify: index a small OKF
      fixture bundle; assert entity nodes from `type`, link edges, no error on a
      dangling link.
- [ ] 4b.3 `kb okf lint`: assert bundle conformance (parseable frontmatter +
      non-empty `type`; reserved-file shape) pinned to OKF v0.1. → verify: passes
      on a conformant fixture, fails (exit non-zero) on a `type`-less doc.

## 5. Config, SKILL, docs

- [ ] 5.1 Config schema: `annotation { enabled, model, minConfidence, batchSize }`
      and `ontology { imports, path }` in `knowledge_base.json`; defaults keep
      annotation OFF. → verify: absent config ⇒ annotate no-op, index unchanged.
- [ ] 5.2 `kb-annotate` SKILL under `packages/kb/skill/`: trigger-shaped
      description, procedure wraps `kb annotate` → review diff →
      `kb ontology promote` → `kb index`.
- [ ] 5.3 DOX rows for new files (`annotator.ts`, `ontology.ts`, vendored JSON) in
      `packages/kb/src/AGENTS.md` / `packages/kb/AGENTS.md`; delegate any `docs/`
      prose per the caveman-style rule.

## 6. Discipline checkpoints

- [ ] 6.1 `security-hardening` pass on the trust/opt-in gate, review-queue
      quarantine, and approved-only emission (untrusted content → graph truth).
- [ ] 6.2 `doubt-driven-review` on the two-plane invariant boundary and the
      regen/merge protocol before they stand.
- [ ] 6.3 `observability-instrumentation`: annotate run summary (files touched,
      skipped-on-hash, proposed vs approved counts, model calls/tokens).

## 7. Validate

- [ ] 7.1 `openspec validate add-kb-semantic-annotation-plane --strict` passes.
- [ ] 7.2 End-to-end on a fixture doc set: annotate → review → promote → index →
      `kb neighbors --rel skos:broader` returns expected concept hops.
- [ ] 7.4 OKF interop round-trip: annotate a fixture → `kb okf lint` passes → the
      bundle opens in an OKF-conformant consumer (the reference static visualizer)
      with the `kb:` extension ignored, no error.
- [ ] 7.3 Regression: full `npm test` green; kb graph determinism tests unchanged.
