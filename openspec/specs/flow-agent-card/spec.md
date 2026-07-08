# flow-agent-card Specification

## Purpose
TBD - created by archiving change open-code-handler-from-flow-card. Update Purpose after archive.
## Requirements
### Requirement: Code nodes expose a handler-source open affordance

A `FlowAgentCard` SHALL render a code-source button (`mdiCodeBraces`) in the
card's bottom-right control row when its node kind is `code` or `code-decision`
AND it has a resolved `codeTarget`. The button SHALL open the shell `ui:dialog`
primitive. The dialog body SHALL fetch the
handler file via `GET /api/pi-resource-file?path=<codeTarget>` and render the
returned content. Because the handler is TypeScript (not markdown), the content
SHALL be wrapped in a fenced `ts` code block before being passed to the
`ui:markdown-content` primitive. The fetch SHALL reuse the same loading / loaded
/ error state machine the card uses for the agent `.md` source.

The existing agent `.md` doc-open affordance (gated on `sourcePath`) SHALL be
unchanged; the code-source affordance is additive and SHALL render only for
code-kind cards.

#### Scenario: Code icon shows for a code node with a target

- **WHEN** a flow agent card renders for a node whose kind is `code` or
  `code-decision` and `codeTarget` is set
- **THEN** the card SHALL render a code-source (`mdiCodeBraces`) button in its
  control row

#### Scenario: No code icon for agent nodes

- **WHEN** a flow agent card renders for an `agent`-kind node
- **THEN** the card SHALL NOT render the code-source button (only the existing
  agent doc/source affordances may appear)

#### Scenario: No code icon when target missing

- **WHEN** a code-kind card has no `codeTarget`
- **THEN** the card SHALL NOT render the code-source button

#### Scenario: Clicking the code icon opens the handler in a dialog

- **WHEN** the user clicks the code-source button on a code-kind card
- **THEN** a `Dialog` SHALL open and the card SHALL fetch
  `/api/pi-resource-file?path=<codeTarget>`
- **AND** on success the handler content SHALL be rendered as a fenced `ts`
  code block via `ui:markdown-content`

#### Scenario: Fetch error surfaces in the dialog

- **WHEN** the handler fetch fails or returns an error response
- **THEN** the dialog SHALL show the error message instead of source content

#### Scenario: Absolute target passed verbatim

- **WHEN** the card fetches a code node's handler source
- **THEN** the card SHALL pass `codeTarget` verbatim to
  `/api/pi-resource-file?path=<codeTarget>` (the upstream `flow_agent_started`
  event emits an absolute path, which `path.resolve` leaves unchanged and the
  server allow-list `<cwd>/.pi/...` accepts)

### Requirement: Agent card displays per-agent cost

A `FlowAgentCard` in its complete state SHALL display the accumulated per-agent
USD cost carried by the `flow_agent_complete` event's `result.cost`, rendered in
the stats line next to token usage and duration (e.g. `↑12k ↓3k · $0.0142 · 4.2s`).

The cost segment SHALL be suppressed when `cost` is absent, `undefined`, or `0`,
mirroring how the card already handles zero/absent token and duration values.
When suppressed, the stats line SHALL render exactly as it does today
(`↑in ↓out · duration`) with no leftover separator.

The formatted value SHALL match the pi-flows TUI precision: two decimals when
the amount is `>= 1` (`$1.20`), four decimals when sub-dollar (`$0.0142`).

The per-agent `cost` SHALL originate from `FlowAgentState.cost`, populated by the
`flow_agent_complete` reducer case from `result.cost`; the reducer SHALL store
the value verbatim (no re-computation) and SHALL leave it `undefined` when the
event omits it.

#### Scenario: Cost shows for a completed agent with nonzero cost

- **WHEN** a flow agent card renders in its complete state for a node whose
  `flow_agent_complete` carried `result.cost` greater than `0`
- **THEN** the stats line SHALL include a `$`-prefixed cost segment between the
  token counts and the duration

#### Scenario: Cost hidden when zero

- **WHEN** a completed agent card has `cost` equal to `0`
- **THEN** the stats line SHALL omit the cost segment and render only tokens and
  duration

#### Scenario: Cost hidden when absent

- **WHEN** a completed agent card has no `cost` (connected pi session predates
  pi-flows cost surfacing, so `result.cost` is `undefined`)
- **THEN** the stats line SHALL omit the cost segment without error

#### Scenario: Sub-dollar cost keeps four decimals

- **WHEN** a completed agent card renders a `cost` value below `1`
- **THEN** the displayed amount SHALL show four decimal places (e.g. `$0.0142`)

#### Scenario: Whole-dollar cost keeps two decimals

- **WHEN** a completed agent card renders a `cost` value at or above `1`
- **THEN** the displayed amount SHALL show two decimal places (e.g. `$1.20`)

