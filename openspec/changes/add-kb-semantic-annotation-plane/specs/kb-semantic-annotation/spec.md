# kb-semantic-annotation — delta

## ADDED Requirements

### Requirement: Two-plane split with frontmatter as the contract

The system SHALL provide an optional LLM-based semantic-annotation plane that is
strictly separate from the deterministic indexer. The annotation plane SHALL run
at write-time, read document body content, and write its output into a
machine-managed `kb:` frontmatter block. The indexer SHALL derive graph nodes and
edges from that frontmatter deterministically and SHALL NOT call any LLM or
embedding model. Frontmatter SHALL be the only interface between the two planes.

#### Scenario: Indexer never calls an LLM

- **WHEN** `kb index` runs, with or without `kb:` annotation blocks present
- **THEN** it SHALL NOT invoke any LLM or embedding model
- **AND** it SHALL derive graph edges only from parsed frontmatter and structure

#### Scenario: Annotation is opt-in and no-op by default

- **WHEN** `annotation.enabled` is not set and `kb annotate` runs
- **THEN** it SHALL make no model calls and write no frontmatter
- **AND** the indexer SHALL produce the same graph as before the feature existed

### Requirement: Deterministic Tier-1a provenance edges (no LLM)

The indexer SHALL emit typed provenance edges deterministically, without any LLM,
from conventions the repository already follows: a `See change: <change-id>`
mention SHALL produce a `kb:changedBy` edge from the file to a `kb:Change`
entity; a file's location under `packages/<pkg>/` SHALL produce a `kb:partOf`
edge to a `kb:Package` entity; and an OpenSpec change's declared capabilities
(from its proposal's `### New Capabilities` / `### Modified Capabilities` and the
`specs/<capability>/` tree) SHALL produce `kb:realizes` edges from the
`kb:Change` to each `kb:Capability`. These edges SHALL be emitted with
`status: approved` semantics (indexed immediately) and SHALL NOT depend on the
annotation plane, an ontology promotion, or any model call.

#### Scenario: `See change:` yields a changedBy edge

- **WHEN** an indexed file contains `See change: fix-restart-bridge-auto-start-race`
- **THEN** the indexer SHALL emit a `kb:changedBy` edge from that file to a
  `kb:Change` node named for that change id
- **AND** it SHALL do so without invoking any LLM or embedding model

#### Scenario: Package membership yields a partOf edge

- **WHEN** a markdown file is indexed at a path under `packages/<pkg>/`
- **THEN** the indexer SHALL emit a `kb:partOf` edge from that file to a
  `kb:Package` node named `<pkg>`

#### Scenario: OpenSpec structure yields realizes edges

- **WHEN** an OpenSpec change proposal declares capabilities and carries
  `specs/<capability>/spec.md` deltas
- **THEN** the indexer SHALL emit `kb:realizes` edges from the `kb:Change` to each
  declared `kb:Capability`, deterministically

### Requirement: Ontology-constrained entity and relation extraction

The annotation plane SHALL be constrained by a controlled vocabulary composed of
a project ontology file plus vendored subsets of schema.org and SKOS. The
annotator SHALL be given the allowed entity types and relation predicates (as
CURIEs) and SHALL classify content into that vocabulary. A deterministic
validator SHALL run between the model output and disk, normalizing aliases to
canonical CURIEs and classifying each item as known or unknown against the
ontology.

#### Scenario: Known vocabulary is approved

- **WHEN** the annotator emits an entity whose type is present in the ontology
- **THEN** the validator SHALL write it with `status: approved`
- **AND** the indexer SHALL emit a corresponding `entity` node and typed edge

#### Scenario: Alias normalization

- **WHEN** the model emits an aliased type or predicate present in the ontology's
  alias map (e.g. `Author` → `schema:Person`, `dep` → `schema:dependsOn`)
- **THEN** the validator SHALL normalize it to the canonical CURIE before writing

### Requirement: Open-world proposals via an inert review queue

The annotator SHALL be permitted to propose entity types or relation predicates
outside the current ontology (open-world). Such proposed items SHALL be written
with `status: proposed` and mirrored to a review queue file, and SHALL be inert: the indexer SHALL NOT emit graph edges
for `proposed` or `rejected` items. Promotion of a proposed vocabulary term SHALL
be a deterministic operation that adds it to the ontology and bumps the ontology
version, causing matching proposed items to become `approved` on the next index
run without re-invoking the model.

#### Scenario: Proposed vocabulary produces no graph edge

- **WHEN** a `kb:` relation has `status: proposed` (unknown predicate)
- **THEN** `kb index` SHALL NOT create an edge for it
- **AND** the proposed predicate SHALL appear in `kb ontology review`

#### Scenario: Promotion is deterministic

- **WHEN** a curator runs `kb ontology promote <curie>`
- **THEN** the term SHALL be added to the ontology and the ontology version SHALL
  bump
- **AND** re-running `kb index` SHALL flip matching `proposed` items to `approved`
  and emit their edges WITHOUT calling any model

#### Scenario: Rejection stops re-proposal

- **WHEN** a curator runs `kb ontology reject <curie>`
- **THEN** the term SHALL be recorded on a stop-list
- **AND** subsequent `kb annotate` runs SHALL be instructed not to propose it

### Requirement: Provenance and idempotent, merge-preserving regeneration

The `kb:` block SHALL carry annotator provenance (`model`, `ontologyVersion`,
`contentHash`, `annotatedAt`) and per-item `status`, `confidence`, and `source`
(`llm` or `human`), with an optional `pinned` flag. Re-annotation SHALL be
hash-gated: when a file body's sha256 equals the recorded `contentHash` and the
ontology version is unchanged, `kb annotate` SHALL make no model call. When
re-annotation does run, it SHALL preserve `source: human` and `pinned: true` items
verbatim and replace only machine-authored (`source: llm`, not pinned) items.

#### Scenario: Unchanged file is skipped without a model call

- **WHEN** `kb annotate` re-runs on a file whose body hash and the ontology
  version both match the recorded provenance
- **THEN** it SHALL NOT invoke the model and SHALL leave the `kb:` block unchanged

#### Scenario: Human-authored items survive regeneration

- **WHEN** `kb annotate` regenerates a file that contains a `kb:` item with
  `source: human` or `pinned: true`
- **THEN** that item SHALL be preserved verbatim
- **AND** only machine-authored, unpinned items SHALL be replaced

#### Scenario: Ontology version bump forces re-evaluation

- **WHEN** the ontology version changes and `kb annotate` re-runs on an otherwise
  unchanged file
- **THEN** the hash-gate SHALL NOT skip the file (version mismatch)

### Requirement: Typed-predicate graph traversal

The graph traversal commands SHALL accept an optional relation filter so a caller
can traverse a single predicate. `kb neighbors <node> --rel <curie>` and
`kb backlinks <node> --rel <curie>` SHALL restrict results to edges of that
predicate, enabling typed reference-context expansion.

#### Scenario: Filter traversal by predicate

- **WHEN** `kb neighbors "<node>" --rel schema:dependsOn` runs
- **THEN** only nodes reachable via `schema:dependsOn` edges SHALL be returned
- **AND** edges of other predicates SHALL be excluded

### Requirement: OKF-conformant frontmatter production

The annotation plane SHALL write frontmatter that conforms to the Open Knowledge
Format (OKF) v0.1: every annotated document SHALL carry a top-level, non-empty
`type` field, and SHALL surface the OKF standard fields `tags` and `timestamp`
(and `title`/`resource` when known) at the top level. The typed-graph data
(entities, typed relations, provenance) SHALL be carried under a namespaced `kb:`
extension key, which OKF permits as an unrecognized producer field. The system
SHALL NOT require any non-OKF consumer to understand the `kb:` extension in order
to read the document.

#### Scenario: Annotated document is OKF-conformant

- **WHEN** the annotator writes frontmatter for a document
- **THEN** the frontmatter SHALL contain a non-empty top-level `type` field
- **AND** the typed relations/provenance SHALL live under the `kb:` extension key
- **AND** the document SHALL remain a valid OKF concept readable by an
  OKF-conformant consumer that ignores the `kb:` key

#### Scenario: Ontology types satisfy OKF's open type vocabulary

- **WHEN** the top-level `type` is a project ontology CURIE (e.g. `kb:Component`)
- **THEN** it SHALL satisfy OKF's `type` requirement (OKF does not centrally
  register type values)
- **AND** an OKF consumer that does not know the CURIE SHALL treat it as a generic
  concept without error

### Requirement: OKF bundle consumption with reserved-file conventions

The system SHALL index OKF bundles as an ordinary markdown source (OKF is plain
markdown; the existing source resolvers already apply). When indexing, the system
SHALL map a document's top-level OKF `type` to an `entity` node, SHALL treat
markdown links between concepts as graph edges (as today), and SHALL recognize the
OKF reserved files: `index.md` as directory-level progressive-disclosure listing
and `log.md` as chronological change history. Consumption SHALL tolerate broken
cross-links (a link to a not-yet-written concept SHALL NOT be an error).

#### Scenario: OKF bundle indexes without new plumbing

- **WHEN** a filesystem/git/npm/https source points at an OKF bundle directory
- **THEN** the indexer SHALL index its markdown and build link edges as for any
  markdown source
- **AND** each concept's top-level `type` SHALL produce an `entity` node

#### Scenario: Reserved files are recognized

- **WHEN** an indexed OKF bundle contains `index.md` and `log.md`
- **THEN** `index.md` SHALL be treated as a progressive-disclosure listing for its
  directory scope
- **AND** `log.md` date-grouped entries SHALL be available as change history
  (feeding the Tier-1a `kb:changedBy` provenance where applicable)

#### Scenario: Broken cross-link is tolerated

- **WHEN** a concept links to a path that does not exist in the bundle
- **THEN** the system SHALL NOT treat it as malformed
- **AND** it MAY record the target as an unresolved node (not-yet-written knowledge)

### Requirement: Determinism guardrails on the annotator

The single model invocation per file SHALL run at temperature 0 against a fixed
structured-output schema, constrained by the ontology whitelist. The system SHALL
NOT treat model output as graph truth directly: an item becomes a graph edge only
after passing the deterministic validator AND carrying `status: approved`. The
approval transition SHALL be reviewable as a git diff of the `kb:` block before
indexing.

#### Scenario: Model output is not graph truth until approved

- **WHEN** the annotator writes candidate items to a `kb:` block
- **THEN** the indexer SHALL emit edges only for items with `status: approved`
- **AND** approval SHALL be visible as a frontmatter diff prior to `kb index`
