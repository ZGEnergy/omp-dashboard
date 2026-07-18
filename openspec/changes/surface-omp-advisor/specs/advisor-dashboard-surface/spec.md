# advisor-dashboard-surface — delta

## ADDED Requirements

### Requirement: Live advisor cards render in the chat stream
The client event reducer SHALL create a chat row of role `"advisor"` on a `message_end`
event whose `data.message.role === "custom"` and `data.message.customType === "advisor"`,
provided `data.message.display !== false`. Rows SHALL be upserted by
`data.entryId ?? data.message.id` so duplicate delivery cannot produce duplicate rows.
The reducer SHALL NOT create advisor rows for non-advisor `customType` values or for
`display === false` messages.

#### Scenario: Advisor card arrives live
- **WHEN** a session emits `message_end` with `data.message = { role: "custom", customType: "advisor", display: true, content: "<advisory>…</advisory>", details: { notes: [{ note: "…", severity: "concern" }] } }`
- **THEN** the session's message list SHALL contain exactly one `"advisor"` row carrying that note list

#### Scenario: Duplicate delivery does not duplicate the row
- **WHEN** two `message_end` events arrive with the same advisor message id
- **THEN** the message list SHALL contain exactly one advisor row for that id

#### Scenario: Non-advisor custom messages stay hidden
- **WHEN** a `message_end` arrives with `role: "custom"` and `customType` other than `"advisor"` (e.g. `"rewind-report"`)
- **THEN** no advisor row SHALL be created

#### Scenario: Hidden advisor cards are skipped
- **WHEN** a `message_end` arrives with `customType: "advisor"` and `display: false`
- **THEN** no advisor row SHALL be created

### Requirement: Replayed sessions restore advisor cards
`replayEntriesAsEvents` SHALL map each persisted entry with `type === "custom_message"`,
`customType === "advisor"`, and `display !== false` to a `message_start` + `message_end`
event pair whose `data.message` is the entry reshaped to message form
(`{ role: "custom", customType, content, details }`) and whose `entryId` is the entry id,
so a refresh or resume renders the same advisor cards as the live stream.

#### Scenario: Reload shows advisor cards
- **GIVEN** a session JSONL containing `{ "type": "custom_message", "customType": "advisor", "display": true, "content": "…", "details": { "notes": [ … ] }, "id": "e7" }`
- **WHEN** the session is replayed (refresh/resume)
- **THEN** the event stream SHALL contain a `message_end` with `entryId: "e7"` and the advisor message payload
- **AND** the chat SHALL render the advisor card exactly as in the live stream

#### Scenario: Flow-event replay unaffected
- **WHEN** replay encounters `type: "custom"` entries with `customType: "flow-event"`
- **THEN** the existing flow-event replay behavior SHALL be unchanged

### Requirement: AdvisorCard presentation
The chat SHALL render advisor rows as a card that is collapsed by default to a single
line: `Advisor [<advisor name when present>] · <N> notes · <highest severity> ·
<first-note preview>`. Expanding SHALL reveal every note railed/labeled by severity.
Severity precedence for the collapsed badge SHALL be `blocker` > `concern` > `nit`. The
structured `details.notes` array SHALL be the render source; when `details` is absent the
card SHALL fall back to rendering the raw `content` as preformatted text. The card SHALL
NOT present any reply or input control.

#### Scenario: Multi-note aside batch collapses with top severity
- **GIVEN** an advisor row with notes of severities `nit`, `blocker`, `nit`
- **THEN** the collapsed line SHALL show `3 notes` and the `blocker` badge

#### Scenario: Missing details falls back to content
- **GIVEN** an advisor row without `details`
- **THEN** the card SHALL render the raw `content` text instead of a note list

### Requirement: Spawn-time advisor flag
`SpawnSessionBrowserMessage` SHALL accept an optional `advisor?: boolean`. When the
server spawns a session with `advisor: true`, it SHALL append `--advisor` to the spawned
omp argv for every spawn-mechanism branch and SHALL record `advisor: true` in the
session's `.meta.json`, including it in the session info broadcast. When the field is
absent or `false`, argv SHALL be unchanged (harness default applies). Unknown-field
degradation SHALL hold: an old server receiving `advisor: true` SHALL perform a bare
spawn without error.

#### Scenario: Spawn with advisor enabled
- **WHEN** the server handles `spawn_session` with `advisor: true`
- **THEN** the spawned omp process argv SHALL contain `--advisor`
- **AND** the session's `.meta.json` and broadcast session info SHALL carry `advisor: true`

#### Scenario: Default spawn unchanged
- **WHEN** the server handles `spawn_session` without an `advisor` field
- **THEN** the spawned argv SHALL NOT contain `--advisor` and no metadata flag SHALL be written

### Requirement: Spawn UI advisor checkbox
The session-spawn UI SHALL offer an "Enable advisor" checkbox whose initial state is the
mirrored global `advisor.enabled` value from `GET /api/omp-config`, defaulting to
unchecked when the mirror is unavailable. The UI SHALL send `advisor: true` only when the
box is checked at spawn time.

#### Scenario: Checkbox seeded from global config
- **GIVEN** the OMP mirror reports `advisor.enabled = true`
- **WHEN** the spawn UI opens
- **THEN** the checkbox SHALL start checked

#### Scenario: Mirror unavailable
- **WHEN** `GET /api/omp-config` fails or lacks the key
- **THEN** the checkbox SHALL start unchecked and spawning SHALL remain possible

### Requirement: Passive advisor chip
Session surfaces SHALL display a non-interactive "Advisor" chip for a session when its
metadata carries `advisor: true` OR its reduced chat state contains at least one advisor
row. The chip SHALL have a tooltip explaining the advisor feature and SHALL NOT present
toggle affordances.

#### Scenario: Chip from spawn metadata
- **WHEN** a session with `.meta.json` `advisor: true` is listed
- **THEN** the chip SHALL be visible before any advisor activity

#### Scenario: Chip from observed activity
- **WHEN** an externally-spawned session (no metadata flag) renders its first advisor card
- **THEN** the chip SHALL become visible

#### Scenario: No chip for advisor-free sessions
- **WHEN** a session has neither the metadata flag nor any advisor row
- **THEN** no chip SHALL be shown
