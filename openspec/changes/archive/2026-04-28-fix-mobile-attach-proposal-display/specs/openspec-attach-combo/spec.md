## ADDED Requirements

### Requirement: Mobile session header shows attached-proposal chip
On mobile viewports, the session header SHALL render a paperclip-prefixed chip displaying `session.attachedProposal` whenever that field is non-empty. The chip SHALL be positioned between the session title and the existing `MobileAttachButton` (paperclip icon + popover), be visually distinct (blue accent), and degrade gracefully on narrow widths via truncation with the full change name available as a `title` attribute.

The chip SHALL be read-only — action affordances (attach, detach) remain in the existing `MobileAttachButton` popover.

#### Scenario: Attached proposal is rendered as a chip
- **WHEN** the viewport is mobile (< 768px) and `session.attachedProposal === "add-auth"`
- **THEN** the mobile session header SHALL render a chip with the paperclip icon and the text `add-auth`
- **AND** the chip SHALL carry `data-testid="mobile-header-attached-chip"`

#### Scenario: No attached proposal hides the chip
- **WHEN** the viewport is mobile and `session.attachedProposal` is `null`, `undefined`, or empty string
- **THEN** the mobile session header SHALL NOT render the chip

#### Scenario: Long change name is truncated with full text in tooltip
- **WHEN** the viewport is mobile and `session.attachedProposal` is a string longer than the chip's max width
- **THEN** the visible chip text SHALL be truncated with CSS ellipsis
- **AND** the chip's `title` attribute SHALL contain the full change name prefixed with `Attached: `

#### Scenario: Chip updates reactively on session_updated
- **WHEN** the server broadcasts `session_updated` with `updates.attachedProposal = "feature-x"`
- **THEN** the mobile session header chip SHALL re-render with `feature-x` within the next paint frame
- **WHEN** the server broadcasts `session_updated` with `updates.attachedProposal = null`
- **THEN** the chip SHALL be removed from the DOM

### Requirement: Mobile session card shows attached-proposal chip
On mobile viewports, each session card SHALL render a paperclip-prefixed chip displaying `session.attachedProposal` whenever that field is non-empty. The chip SHALL coexist with `OpenSpecActivityBadge` (which reads the distinct `openspecPhase` / `openspecChange` fields) — both MAY render simultaneously and MUST NOT visually collide.

#### Scenario: Attached proposal is rendered as a card chip
- **WHEN** the viewport is mobile and `session.attachedProposal === "add-auth"`
- **THEN** the mobile session card SHALL render a chip with the paperclip icon and the text `add-auth`
- **AND** the chip SHALL carry `data-testid="mobile-card-attached-chip"`

#### Scenario: Coexistence with OpenSpec activity badge
- **WHEN** a mobile session card has both `attachedProposal: "add-auth"` and `openspecPhase: "applying"` with `openspecChange: "fix-bug"`
- **THEN** both `mobile-card-attached-chip` and the `OpenSpecActivityBadge` SHALL render
- **AND** the two SHALL be visually distinguishable (the attached chip is blue with the change name; the activity badge carries phase + count semantics)

#### Scenario: No attached proposal hides the chip
- **WHEN** the viewport is mobile and `session.attachedProposal` is null, undefined, or empty
- **THEN** the mobile session card SHALL NOT render the attached-proposal chip

### Requirement: Idempotent auto-rename on attach
When a browser sends `attach_proposal`, the server SHALL set `session.name = changeName` if EITHER the current name is empty/whitespace OR the current name equals the current `session.attachedProposal` (i.e. the name was previously auto-set by an earlier attach and the user has not customised it). When the name was auto-set, the server SHALL forward `rename_session` to the bridge so pi's session name is kept in sync.

#### Scenario: Fresh session — name auto-set on first attach
- **WHEN** session has `name: undefined` and `attachedProposal: null`
- **AND** the browser sends `attach_proposal { changeName: "add-auth" }`
- **THEN** the server SHALL update `session.name = "add-auth"` and `session.attachedProposal = "add-auth"`
- **AND** the server SHALL send `rename_session { name: "add-auth" }` to the bridge
- **AND** the server SHALL broadcast `session_updated` with `updates = { attachedProposal: "add-auth", name: "add-auth" }`

#### Scenario: Custom-named session — name preserved on attach
- **WHEN** session has `name: "my custom"` and `attachedProposal: null`
- **AND** the browser sends `attach_proposal { changeName: "add-auth" }`
- **THEN** the server SHALL update `session.attachedProposal = "add-auth"` only
- **AND** `session.name` SHALL remain `"my custom"`
- **AND** no `rename_session` SHALL be sent to the bridge

#### Scenario: Re-attach after auto-rename — name re-tracks new change
- **WHEN** session has `name: "foo"` and `attachedProposal: "foo"` (auto-set on a previous attach)
- **AND** the browser sends `attach_proposal { changeName: "bar" }`
- **THEN** the server SHALL update `session.name = "bar"` and `session.attachedProposal = "bar"`
- **AND** the server SHALL send `rename_session { name: "bar" }` to the bridge

#### Scenario: User-customised name — never override on re-attach
- **WHEN** session has `name: "my custom"` and `attachedProposal: "foo"` (user customised after auto-rename)
- **AND** the browser sends `attach_proposal { changeName: "bar" }`
- **THEN** the server SHALL update `session.attachedProposal = "bar"` only
- **AND** `session.name` SHALL remain `"my custom"`
- **AND** no `rename_session` SHALL be sent to the bridge

### Requirement: Idempotent auto-rename revert on detach
When a browser sends `detach_proposal`, the server SHALL clear `session.name` (set to `undefined`) if and only if the current `session.name` equals the current `session.attachedProposal` (i.e. the name was auto-set on a previous attach). When the name was auto-cleared, the server SHALL forward `rename_session` with an empty name to the bridge so pi's session name is reset.

#### Scenario: Auto-set name reverted on detach
- **WHEN** session has `name: "foo"` and `attachedProposal: "foo"`
- **AND** the browser sends `detach_proposal`
- **THEN** the server SHALL update `session.name = undefined`, `session.attachedProposal = null`, `session.openspecPhase = null`, `session.openspecChange = null`
- **AND** the server SHALL send `rename_session { name: "" }` to the bridge
- **AND** the broadcast `session_updated` payload SHALL contain `updates.name = undefined` so the client falls back to `firstMessage` / cwd basename

#### Scenario: User-customised name preserved on detach
- **WHEN** session has `name: "my custom"` and `attachedProposal: "foo"`
- **AND** the browser sends `detach_proposal`
- **THEN** the server SHALL update `session.attachedProposal = null`, `session.openspecPhase = null`, `session.openspecChange = null`
- **AND** `session.name` SHALL remain `"my custom"`
- **AND** no `rename_session` SHALL be sent to the bridge

#### Scenario: Already-empty name unchanged on detach
- **WHEN** session has `name: undefined` and `attachedProposal: "foo"`
- **AND** the browser sends `detach_proposal`
- **THEN** the server SHALL update `attachedProposal: null`, `openspecPhase: null`, `openspecChange: null`
- **AND** `session.name` SHALL remain `undefined`
- **AND** no `rename_session` SHALL be sent to the bridge

#### Scenario: Name set with no attachment is preserved on a defensive detach
- **WHEN** session has `name: "foo"` and `attachedProposal: null` (defensive: no auto-set witness)
- **AND** the browser sends `detach_proposal`
- **THEN** the server SHALL update `attachedProposal: null`, `openspecPhase: null`, `openspecChange: null`
- **AND** `session.name` SHALL remain `"foo"`
- **AND** no `rename_session` SHALL be sent to the bridge

### Requirement: Idempotent auto-rename on auto-detected attach
When the OpenSpec activity detector emits a `changeName` from a `tool_execution_start` event with `isActive: true` (write/CLI activity, not passive reads), the server SHALL apply the same idempotent witness rule used for browser-initiated `attach_proposal`. Specifically, the server SHALL re-attach the session to the detected `changeName` when EITHER the session has no current `attachedProposal` OR the current `attachedProposal` equals the current `session.name` (i.e. the previous attachment was auto-tracked) AND the detected `changeName` differs from the current `attachedProposal`.

The inner rename guard SHALL match the rule defined in `Idempotent auto-rename on attach`: rename the session when its current name is empty/whitespace OR equals the current `attachedProposal`. When the rename guard does not fire, the server SHALL NOT send a `rename_session` message to the bridge.

#### Scenario: Fresh session — auto-detect attaches and auto-names
- **WHEN** session has `name: undefined`, `attachedProposal: null`, `openspecChange: null`
- **AND** the activity detector emits `{ changeName: "bar", isActive: true }`
- **THEN** the server SHALL update `session.attachedProposal = "bar"` and `session.name = "bar"`
- **AND** the server SHALL send `rename_session { name: "bar" }` to the bridge

#### Scenario: Auto-tracked attachment re-attaches when a different changeName is detected
- **WHEN** session has `name: "foo"`, `attachedProposal: "foo"` (auto-tracked from a previous detection)
- **AND** the activity detector emits `{ changeName: "bar", isActive: true }`
- **THEN** the server SHALL update `session.attachedProposal = "bar"` and `session.name = "bar"`
- **AND** the server SHALL send `rename_session { name: "bar" }` to the bridge

#### Scenario: User-customised name — openspecChange tracks reality, attachment preserved
- **WHEN** session has `name: "my custom"`, `attachedProposal: "foo"`, `openspecChange: "foo"`
- **AND** the activity detector emits `{ changeName: "bar", isActive: true }`
- **THEN** the server SHALL update `session.openspecChange = "bar"` (so the activity badge tracks reality)
- **AND** `session.attachedProposal` SHALL remain `"foo"` (user has overridden the auto-tracking)
- **AND** `session.name` SHALL remain `"my custom"`
- **AND** no `rename_session` SHALL be sent to the bridge

#### Scenario: Already-converged state — no redundant rename
- **WHEN** session has `name: "bar"`, `attachedProposal: "bar"`, `openspecChange: "bar"`
- **AND** the activity detector emits `{ changeName: "bar", isActive: true }`
- **THEN** the server SHALL NOT send `rename_session` to the bridge
- **AND** the broadcast `session_updated` payload SHALL NOT include a `name` field for this update (no redundant rebroadcast)
