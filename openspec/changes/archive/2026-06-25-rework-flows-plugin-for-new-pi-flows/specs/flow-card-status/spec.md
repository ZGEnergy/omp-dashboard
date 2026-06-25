## ADDED Requirements

### Requirement: Code and code-decision step cards

The flow card grid SHALL render distinct cards for `code` and `code-decision` step kinds, keyed off the lifecycle event `nodeKind`. Per the pi-flows `surface-node-kind` change, the card type is decided once at `flow_agent_started` (which carries `nodeKind`) and SHALL NOT change at `flow_agent_complete`. A `code` card SHALL show the code badge, the handler path (from the `started` payload), a **Log** preview, and the summary, where: the Log is the step's `flow_assistant_text` `detailHistory` text entries (emitted by `ctx.logger`, keyed to the node's `stepId` — NOT a new channel); the summary is `flow_agent_complete.summary`. A `code-decision` card SHALL additionally show the chosen branch and, when the edge is backward (a loop), a `↻ n/max` loop pill.

#### Scenario: Code log preview from assistant-text entries
- **WHEN** a code handler calls `ctx.logger("checking record against NAV")` during the step
- **THEN** that text arrives as a `flow_assistant_text` entry keyed to the code step
- **AND** the code card SHALL surface it in the Log preview (no separate log event/channel is required)

#### Scenario: Code card renders
- **WHEN** a `flow_agent_started` event arrives with `nodeKind: "code"`
- **THEN** the grid SHALL render a code card with a `code` badge and the handler path

#### Scenario: Code-decision card shows chosen branch
- **WHEN** a `code-decision` step completes with chosen branch `rework` from its typed outputs
- **THEN** the card SHALL display the taken branch `rework`

#### Scenario: Loop pill on backward edge
- **WHEN** a `code-decision` (or `agent-decision`) routes a backward edge on iteration 2 of `max_iterations` 3
- **THEN** the card SHALL display a `↻ 2/3` loop pill

### Requirement: Outputs section on agent and code cards

Agent, `code`, and `code-decision` cards SHALL render an "Outputs" section listing the step's typed outputs as key/value chips, sourced from the completion event's typed outputs.

#### Scenario: Outputs rendered as chips
- **WHEN** a step completes with typed outputs `{ valid: "true", nav_record: "INV-2231" }`
- **THEN** the card SHALL render an Outputs section with chips `valid: "true"` and `nav_record: "INV-2231"`

#### Scenario: No outputs section when empty
- **WHEN** a step declares no outputs and returns none
- **THEN** the card SHALL omit the Outputs section

### Requirement: Soft and hard failure states are visually distinct

Step cards SHALL distinguish a SOFT failure (recoverable, routed to `on_error`, flow continues) from a HARD failure (unrecoverable, flow halted with status `error`). SOFT SHALL show an amber "routed → <onError>" indicator; HARD SHALL show a red "halted flow" indicator.

#### Scenario: Soft failure routed
- **WHEN** a step fails soft and routes to `park`
- **THEN** the card SHALL show an amber "routed → park" indicator and the flow SHALL continue

#### Scenario: Hard failure halts
- **WHEN** a step fails hard
- **THEN** the card SHALL show a red "halted flow" indicator
- **AND** the flow status SHALL be `error`

### Requirement: FlowGraph renders the new node set minimally

The live FlowGraph SHALL stay minimal (node names + running-step highlight; details live in the cards) and SHALL render the canonical node set `agent`, `agent-decision`, `code`, `code-decision`, `fork`, `flow-ref` with backward/loop edges driven by `max_iterations`. The removed `conditional`, `agent-loop-decision`, and `loopTarget` mappings SHALL NOT be referenced.

#### Scenario: Code-decision node shape
- **WHEN** the graph contains a `code-decision` step
- **THEN** it SHALL render with a decision shape distinct from the plain agent node

#### Scenario: Backward loop edge
- **WHEN** a decision step has a backward edge with `max_iterations`
- **THEN** the graph SHALL render that edge as a backward/loop edge

#### Scenario: No dead node-type references
- **WHEN** the FlowGraph maps step types
- **THEN** it SHALL NOT branch on `conditional`, `agent-loop-decision`, or `loopTarget`

### Requirement: New-node cards replay identically from persisted events

The `nodeKind` discriminator (card type, decided at `started`), typed `outputs` (including the `code-decision` chosen `branch`), and the soft/hard failure outcome SHALL be read from the lifecycle event `data` payload — never from a live-only side channel — so the idempotent `reduceFlowEvent` fold rebuilds an identical card on replay of persisted `flow-event` entries. The `↻ n/max` loop pill SHALL derive from persisted `flow_loop_iteration` events, not a runtime counter.

#### Scenario: Code card replays
- **WHEN** a persisted `flow_agent_started` (with `nodeKind: "code"`) + `flow_agent_complete` pair with typed outputs is replayed via `replayEntriesAsEvents` on reload
- **THEN** the reducer SHALL rebuild the same code card (kind, outputs, summary) the live path produced

#### Scenario: Code-decision branch + loop pill replay
- **WHEN** persisted `code-decision` events plus their `flow_loop_iteration` records are replayed
- **THEN** the card SHALL show the same chosen branch and the same `↻ n/max` loop pill as the live run

### Requirement: Non-terminal new-node cards resolve when the flow ends

When a flow reaches a terminal status (`success` | `error` | `interrupted`, including the synthesized `flow:complete { status: "interrupted" }` emitted on resume of an orphaned run), any `code` / `code-decision` / agent step card still marked `running` (started with no completion event) SHALL render a terminal/interrupted state rather than spinning indefinitely.

#### Scenario: Code node interrupted mid-run
- **WHEN** a `code` step has a persisted `flow_agent_started` but no `flow_agent_complete`, and a terminal `flow_complete` with `status: "interrupted"` is then reduced
- **THEN** the code card SHALL render as interrupted, not `running`

#### Scenario: Clean completion unaffected
- **WHEN** every step has a terminal completion event before `flow_complete`
- **THEN** no card SHALL be downgraded and each SHALL keep its own terminal status
