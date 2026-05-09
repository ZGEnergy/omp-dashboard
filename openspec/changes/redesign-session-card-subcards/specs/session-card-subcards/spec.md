## ADDED Requirements

### Requirement: Subcard wrapper component renders translucent inset panel with capsule legend title
The desktop session card SHALL group related controls inside `SessionSubcard` wrappers. Each `SessionSubcard` SHALL render a translucent inset panel using `color-mix` over the card body color, with a small uppercase capsule (pill) legend overhanging the panel's top border (fieldset-legend style).

The panel container SHALL carry these class tokens: `relative`, `mt-1.5`, `rounded-lg`, `border border-[var(--border-subtle)]`, `bg-[color-mix(in_srgb,var(--bg-surface)_50%,transparent)]`, `px-2 py-1.5`.

The legend title SHALL be an absolutely-positioned `<span>` with class tokens: `absolute`, `-top-1.5`, `left-1/2`, `-translate-x-1/2`, `px-1.5`, `py-px`, `rounded-full`, `bg-[var(--bg-tertiary)]`, `border border-[var(--border-subtle)]`, `text-[9px]`, `uppercase`, `tracking-wider`, `text-[var(--text-muted)]`, `leading-none`. It SHALL render the wrapper's `title` prop verbatim.

#### Scenario: Subcard renders capsule legend and translucent panel
- **WHEN** `<SessionSubcard title="OPENSPEC">...</SessionSubcard>` is rendered with non-empty children
- **THEN** the rendered output SHALL contain a panel with class tokens `relative`, `bg-[color-mix(in_srgb,var(--bg-surface)_50%,transparent)]`, `border`, `rounded-lg`
- **AND** the panel SHALL contain a capsule `<span>` with text `OPENSPEC` carrying class tokens `absolute`, `-top-1.5`, `rounded-full`, `uppercase`
- **AND** the children SHALL be rendered inside the panel

#### Scenario: Subcard hides when children are null
- **WHEN** `<SessionSubcard title="MEMORY">{null}</SessionSubcard>` is rendered
- **THEN** the wrapper SHALL render nothing (no panel, no title row)

#### Scenario: Subcard hides when children are false
- **WHEN** `<SessionSubcard title="PROCESS">{false}</SessionSubcard>` is rendered
- **THEN** the wrapper SHALL render nothing

#### Scenario: Subcard hides when children are an empty array
- **WHEN** `<SessionSubcard title="FLOWS">{[]}</SessionSubcard>` is rendered
- **THEN** the wrapper SHALL render nothing

### Requirement: Desktop session card body groups sections into five subcards in order
The desktop branch of `SessionCard.tsx` SHALL render its grouped sections as `SessionSubcard` instances in the following top-to-bottom order: `OPENSPEC`, `WORKSPACE`, `PROCESS`, `MEMORY`, `FLOWS`. The header zone (status dot, name + rename, time, hide/close icons, model + thinking-level + Fork button, activity row with context bar + cost) SHALL remain outside any subcard, above the first subcard. The footer plugin slot `SessionCardActionBarSlot` SHALL remain outside any subcard, below the last subcard.

#### Scenario: All five subcard titles appear in order when populated
- **WHEN** a desktop session card is rendered with content for every subcard
- **THEN** the rendered DOM SHALL contain centered title elements `OPENSPEC`, `WORKSPACE`, `PROCESS`, `MEMORY`, `FLOWS` in that document order

#### Scenario: Header zone stays outside subcards
- **WHEN** a desktop session card is rendered
- **THEN** the session name, model line, and activity/cost row SHALL render before the first `SessionSubcard` element
- **AND** none of those elements SHALL be descendants of a `SessionSubcard`

### Requirement: Subcards hide when their content is empty
Each subcard's content SHALL be wrapped in the existing prop guards. When a guard yields no element, the corresponding `SessionSubcard` SHALL render nothing (no panel, no title).

| Subcard | Renders only when |
|---|---|
| OPENSPEC | `openspecChanges && onSendPrompt && onAttachProposal && onDetachProposal` AND `SessionOpenSpecActions` produces output (attached proposal OR available changes OR phase) |
| WORKSPACE | `showGitInfo` is true OR a plugin contributes to `session-card-badge` slot |
| PROCESS | `processes && processes.length > 0 && onKillProcess` |
| MEMORY | A plugin contributes to the `session-card-memory` slot |
| FLOWS | `flows && onFlowAction` AND there is at least one flow OR a `flows:new` command available |

#### Scenario: Empty PROCESS subcard is hidden
- **WHEN** a desktop session card is rendered with `processes={[]}`
- **THEN** no element with title text `PROCESS` SHALL appear

#### Scenario: Empty MEMORY subcard is hidden when no plugin claims slot
- **WHEN** a desktop session card is rendered and no plugin has registered a `session-card-memory` claim
- **THEN** no element with title text `MEMORY` SHALL appear

#### Scenario: Empty OPENSPEC subcard is hidden when handlers absent
- **WHEN** a desktop session card is rendered without `openspecChanges` or `onAttachProposal`
- **THEN** no element with title text `OPENSPEC` SHALL appear

### Requirement: Mobile session card layout is unchanged
The mobile branch of `SessionCard.tsx` (gated by `useMobile()`) SHALL NOT use `SessionSubcard` wrappers. Mobile cards SHALL retain their flat row layout, identical to the layout prior to this change.

#### Scenario: Mobile card renders no subcard panels
- **WHEN** `useMobile()` returns true and a session card is rendered
- **THEN** no element with class token `bg-[var(--bg-surface)]` AND inset border styling characteristic of `SessionSubcard` SHALL appear inside the card
- **AND** no centered uppercase title element with content matching `OPENSPEC|WORKSPACE|PROCESS|MEMORY|FLOWS` SHALL appear

### Requirement: Outer card chrome and pulse animations are preserved
The outer `<li>` element of the session card SHALL retain its existing classes for selection accent (`border-blue-500/60`, `ring-1 ring-blue-500/30` when selected), background (`bg-[var(--bg-tertiary)]`), rounded corners (`rounded-xl`), shadow, and pulse animations (`card-working-pulse`, `card-unread-pulse`) per the `session-card-status` and `sleek-card-design` capabilities.

#### Scenario: Selected card retains accent ring
- **WHEN** a session card is rendered as selected
- **THEN** the outer `<li>` SHALL have class tokens `border-blue-500/60` and `ring-1 ring-blue-500/30`
- **AND** introduction of subcards SHALL NOT change those classes

#### Scenario: Streaming card retains working pulse
- **WHEN** a session card is rendered with `session.status === "streaming"`
- **THEN** the outer `<li>` SHALL still carry `card-working-pulse` regardless of subcard contents

### Requirement: New plugin slot `session-card-memory` is reserved and consumed by MEMORY subcard
A new dashboard plugin slot identifier `session-card-memory` SHALL be added to `SLOT_DEFINITIONS` in `packages/shared/src/dashboard-plugin/slot-types.ts`. Multiplicity SHALL be `many`. Payload tier SHALL be `react-only` (matching `session-card-action-bar`). The slot SHALL render its claims inside the MEMORY subcard. When no plugin claims the slot, the subcard renders nothing.

A matching consumer component `SessionCardMemorySlot({ session })` SHALL be exported from `packages/dashboard-plugin-runtime/src/slot-consumers.tsx`.

#### Scenario: Slot definition exists
- **WHEN** the slot registry is initialized
- **THEN** `SLOT_DEFINITIONS` SHALL contain an entry with `id: "session-card-memory"` and `multiplicity: "many"`

#### Scenario: Plugin contribution renders inside MEMORY subcard
- **WHEN** a plugin registers a `session-card-memory` claim that returns a non-empty React node
- **AND** a desktop session card is rendered for the matching session
- **THEN** the rendered DOM SHALL contain a `MEMORY` titled subcard
- **AND** the plugin's contribution SHALL appear inside that subcard's body

### Requirement: New plugin slot `workspace-action-bar` is reserved and consumed by WORKSPACE subcard
A new dashboard plugin slot identifier `workspace-action-bar` SHALL be added to `SLOT_DEFINITIONS`. Multiplicity SHALL be `many`. Payload tier SHALL be `react-only`. The slot SHALL render its claims inside the WORKSPACE subcard alongside `GitInfo` and `SessionCardBadgeSlot` contributions. When no plugin claims the slot, the WORKSPACE subcard hides only when ALL of: `showGitInfo === false`, no `session-card-badge` claim matches, no `workspace-action-bar` claim matches.

A matching consumer component `WorkspaceActionBarSlot({ session })` SHALL be exported from `packages/dashboard-plugin-runtime/src/slot-consumers.tsx`.

#### Scenario: Slot definition exists
- **WHEN** the slot registry is initialized
- **THEN** `SLOT_DEFINITIONS` SHALL contain an entry with `id: "workspace-action-bar"` and `multiplicity: "many"`

#### Scenario: Plugin contribution renders inside WORKSPACE subcard
- **WHEN** a plugin registers a `workspace-action-bar` claim that returns a non-empty React node
- **AND** a desktop session card is rendered for the matching session
- **THEN** the rendered DOM SHALL contain a `WORKSPACE` titled subcard
- **AND** the plugin's contribution SHALL appear inside that subcard's body

### Requirement: `useSlotHasClaimsForSession` hook gates parent containers
The runtime SHALL export a hook `useSlotHasClaimsForSession(slotId, session): boolean` from `packages/dashboard-plugin-runtime/src/slot-consumers.tsx`. The hook SHALL return `true` when at least one plugin claim for `slotId` matches the given session per the slot's targeting rules; otherwise `false`. It enables call sites (e.g. `WorkspaceSubcard`, `MemorySubcard`) to conditionally render a parent panel without invoking the slot's render path twice.

#### Scenario: Returns false when registry is unavailable
- **WHEN** the hook is called outside a `PluginContextProvider`
- **THEN** it SHALL return `false`

#### Scenario: Returns true when matching claim exists
- **WHEN** a plugin claims `session-card-memory` matching session `s1`
- **AND** the hook is called with `("session-card-memory", s1)`
- **THEN** it SHALL return `true`

### Requirement: Status indicator is the source icon colored by status
The round status dot at the start of the session card SHALL be replaced by the source MDI icon (`sourceIcons[session.source]`: `mdiConsoleLine` for `tui`, `mdiRobotOutline` for `dashboard`, `mdiApplicationOutline` for `tmux`, `mdiCodeTags` for `zed`). The icon's text color SHALL reflect session status, derived from `dotColor` by mapping leading `bg-<palette>` tokens to `text-<palette>` (regex `/\bbg-(?!\[)/g`). For `session.status === "ended"` the icon SHALL use `text-[var(--text-muted)]`.

The icon span SHALL carry `data-testid="session-status-icon"` and `title={"<sourceLabel> — <status>"}`. This requirement applies to BOTH desktop and mobile branches of `SessionCard.tsx`.

#### Scenario: Active session shows green source icon
- **WHEN** a session card is rendered with `source: "tui"` and `status: "active"`
- **THEN** the DOM SHALL contain an element with `data-testid="session-status-icon"` carrying class `text-green-500`
- **AND** an SVG path matching `mdiConsoleLine` SHALL be present inside it

#### Scenario: Ended session uses muted color
- **WHEN** a session card is rendered with `status: "ended"`
- **THEN** the `session-status-icon` element SHALL carry class `text-[var(--text-muted)]`

#### Scenario: Error overrides retry which overrides status
- **WHEN** a session card is rendered with `hasError: true` AND `isRetrying: true`
- **THEN** the `session-status-icon` element SHALL carry class `text-red-500`
- **AND** SHALL NOT carry class `text-amber-500`

### Requirement: Card left gutter is the drag handle (no overlay icon)
`SortableSessionCard` SHALL NOT render any visible drag-handle icon overlay. It SHALL provide its dnd-kit `attributes` and `listeners` to descendant cards via a React context (`DragHandleCtx`) exported as a hook `useSessionCardDragHandle()`.

The desktop branch of `SessionCard.tsx` SHALL consume the context and spread the handle props onto its left gutter `<div>` (the column containing the status icon). The gutter SHALL carry `cursor-grab active:cursor-grabbing` when context is non-null, and `data-testid="drag-handle-session"`. Click events on the gutter SHALL stop propagation when handle props are present so the gutter does not double as a select target during drag.

#### Scenario: Drag handle context provided by SortableSessionCard
- **WHEN** a SessionCard is rendered as a child of SortableSessionCard
- **THEN** the gutter `<div>` SHALL carry `data-testid="drag-handle-session"` and class tokens `cursor-grab`, `active:cursor-grabbing`

#### Scenario: Drag handle absent without context
- **WHEN** a SessionCard is rendered without a SortableSessionCard ancestor
- **THEN** the gutter `<div>` SHALL NOT carry `data-testid="drag-handle-session"` and SHALL NOT carry `cursor-grab`

#### Scenario: No legacy drag-handle icon overlay
- **WHEN** a SortableSessionCard is rendered
- **THEN** the rendered DOM SHALL NOT contain an absolute-positioned span with the `mdiDragHorizontalVariant` icon path
