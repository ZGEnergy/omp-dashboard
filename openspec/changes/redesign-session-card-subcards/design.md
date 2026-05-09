## Context

`packages/client/src/components/SessionCard.tsx` (~668 lines) renders a desktop session card as a flat sequence of rows: header lines (name/model/activity), badges (OpenSpec/Flow), git info, and a tail of action components (`SessionOpenSpecActions`, `SessionCardBadgeSlot`, `SessionCardActionBarSlot`, `SessionFlowActions`, `ProcessList`). There is no visual grouping — each area abuts its neighbour separated only by margin.

Independent feature areas (OpenSpec, Workspace/jj, Process, Memory, Flows) have grown side by side without a containing visual idiom. The user-accepted nano-banana sketch (`/tmp/banana/card-redesign.png`) groups them into stacked **inset subcards** with centered uppercase titles. The mobile branch (`useMobile()`) is intentionally unchanged — mobile keeps its dense vertical list because subcard chrome would waste vertical space on small viewports.

Existing visual contracts to preserve:
- Outer card: `rounded-xl`, selection ring, `card-working-pulse` / `card-unread-pulse` animations (`session-card-status` spec).
- Header zone: status dot, name/rename, time, hide/close icons, model + Fork button, activity row with context bar + cost.
- All sub-component behaviour: `SessionOpenSpecActions`, `SessionFlowActions`, `ProcessList`, plugin slots, jj/git row.

## Goals / Non-Goals

**Goals:**
- Visually group five section-types into titled inset panels (subcards).
- Each subcard renders only when it has content (no empty panels).
- Centered uppercase title is the visual anchor for each subcard.
- Header zone (above subcards) and outer card chrome remain untouched.
- Behavioural parity: every existing button, dialog, callback, and event handler keeps the same wiring.
- Tests updated to cover new structure and empty-state hiding.

**Non-Goals:**
- Mobile card layout (no change).
- Server, bridge, or protocol changes.
- New data sources for MEMORY/PROCESS — they use the existing props (`processes`, future Honcho hooks remain pluggable).
- Reordering controls within an area.
- Theming / CSS-variable changes beyond reusing existing tokens (`--bg-tertiary`, `--bg-surface`, `--border-subtle`, `--text-muted`).
- Settings UI to toggle subcard visibility (out of scope; subcards always render when populated).

## Decisions

### D1: Subcard as a small dumb wrapper component

Introduce one tiny wrapper, `SessionSubcard`, in the same file (or a sibling file `packages/client/src/components/SessionSubcard.tsx`). API:

```tsx
<SessionSubcard title="OPENSPEC">
  ...controls...
</SessionSubcard>
```

Behaviour: renders nothing if `children` is null/false/empty array; otherwise renders an inset panel with a centered title row above the children.

**Why a wrapper, not a hook or HOC:** the visual grouping is purely structural — one DOM element with consistent classes. A wrapper keeps SessionCard.tsx readable: each subcard becomes a 5-line block instead of repeated `<div className="...">` boilerplate.

**Alternative considered:** inline `<div className="subcard">` in five places. Rejected — duplicates Tailwind class soup and makes future style tweaks five-place edits.

### D2: Empty-state hiding lives at the call site, not inside the wrapper

Each subcard's content is wrapped in the existing render-guard expression (`processes && processes.length > 0 && onKillProcess && <ProcessList .../>`). When the guard yields `null`, the subcard wrapper sees no meaningful children and itself renders nothing.

Implementation pattern:
```tsx
{processes && processes.length > 0 && onKillProcess && (
  <SessionSubcard title="PROCESS">
    <ProcessList processes={processes} onKill={onKillProcess} />
  </SessionSubcard>
)}
```

**Why call-site guards:** preserves existing predicates verbatim — no refactor of which props gate which UI. Wrapper stays trivial (no `Children.toArray` introspection, which is brittle with conditional JSX).

### D3: MEMORY subcard is a placeholder slot, not new functionality

Per the proposal, MEMORY appears in the sketch but no Honcho data source exists today inside SessionCard. Decision: include MEMORY in the subcard taxonomy but render it through a new plugin slot (`session-card-memory`) so it stays empty and hidden until a memory plugin contributes content. This avoids introducing speculative state ownership in this change.

**Alternative considered:** drop MEMORY from this change. Rejected — the user explicitly accepted a sketch with five subcards, and reserving the slot now means future memory work plugs in without re-architecting SessionCard.

**Alternative considered:** hardcode a "no memory data" stub. Rejected — violates "no empty panels" rule.

### D4: WORKSPACE subcard wraps the existing GitInfo row + plugin contributions

Today `<GitInfo session={session} />` renders the jj/git pill row when `showGitInfo` is true. The subcard groups this with `SessionCardBadgeSlot` (currently above it), so jj-related plugin badges sit alongside the branch info. Source-icon gutter and the source badge in the action row are **unchanged** (still part of card chrome / footer).

### D5: Subcards live inside the existing right-hand content column

The desktop card already uses a two-column flex layout: 4-px left gutter (status dot + source icon) and a content column. Subcards stack inside the content column, after the existing header lines (name, model, activity). This means the gutter still spans the full card height, providing visual continuity even when subcards have stronger borders.

### D6: Visual style — inset darker panel

```
className="mt-2 rounded-lg border border-[var(--border-subtle)]
           bg-[var(--bg-surface)] px-3 py-2"
```

Title row:
```
className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]
           text-center mb-1.5"
```

`--bg-surface` is darker than `--bg-tertiary` (the card body), giving the inset effect against the outer card. No new CSS tokens introduced.

**Alternative considered:** lighter panel (`--bg-elevated`). Rejected — would visually "lift" instead of inset, contradicting the sketch.

### D7: Order of subcards (top → bottom)

`OPENSPEC` → `WORKSPACE` → `PROCESS` → `MEMORY` → `FLOWS`.

OpenSpec sits at the top because it's the user's most active context (attach, tasks, apply). FLOWS at the bottom matches existing card layout. PROCESS between WORKSPACE and FLOWS keeps "infra/runtime" grouped before "agentic actions."

## Risks / Trade-offs

- **[Risk] Vertical card height grows** when many subcards are populated → Mitigation: subcards have minimal padding (`px-3 py-2`); empty ones hidden; the OpenSpec section is the only one usually populated, so typical card height grows by ~30 px (one subcard wrapper).
- **[Risk] Test churn** — `SessionCard.test.tsx` queries by row structure → Mitigation: update tests to query by subcard title (`getByText('OPENSPEC')`) which is more semantic than row indices.
- **[Risk] Plugin slots (`SessionCardBadgeSlot`, `SessionCardActionBarSlot`) currently render outside any group** → Mitigation: keep `SessionCardActionBarSlot` outside subcards (it is the card footer); place `SessionCardBadgeSlot` in WORKSPACE subcard (badges are typically jj/git/branch annotations). Document in the sleek-card-design delta.
- **[Trade-off] MEMORY subcard introduces a new plugin slot id** that is currently uncontributed → Acceptable: registering the slot in `SLOT_DEFINITIONS` is cheap and unblocks future work; it costs zero render time when no plugin claims it.
- **[Risk] Mobile/desktop divergence widens** — mobile stays flat, desktop becomes subcards → Mitigation: documented as intentional non-goal; no shared sub-render path is broken because the mobile branch already short-circuits at the top of the component.

## Migration Plan

Single PR, behind no flag:
1. Land `SessionSubcard` wrapper + `session-card-memory` slot definition.
2. Refactor desktop branch of `SessionCard.tsx` to wrap five blocks in subcards.
3. Update `SessionCard.test.tsx` for new structure.
4. Visual QA via `browser-visual-debug` skill on the running dashboard.

Rollback: revert the single PR — no schema, persistence, or protocol changes to undo.

## Iterative Decisions (added during implementation)

### D8: Capsule legend title (overhanging top border) instead of inline centered title

First implementation centered the title inside the panel (`text-center mb-1.5`). User feedback: too much vertical space, weak visual identity. Switched to a fieldset-legend style:

```tsx
<span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-px
                 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]
                 text-[9px] uppercase tracking-wider text-[var(--text-muted)] leading-none">
  {title}
</span>
```

Panel becomes `relative` so the absolute legend is anchored. Legend bg matches the outer card (`--bg-tertiary`) so it visually "breaks" the panel's top border, mimicking an HTML `<fieldset><legend>`.

### D9: Translucent subcard background via `color-mix`

First implementation used `bg-[var(--bg-surface)]` (opaque). User feedback: "50% more transparent — not content". Switched to `bg-[color-mix(in_srgb,var(--bg-surface)_50%,transparent)]` so the panel blends with the card body without affecting child opacity. Pattern already established in the codebase (`AgentCardShell`, `DiffView`, `ModelSelector`).

Why not `opacity-50` on the panel: would also fade child content. Why not `bg-[var(--bg-surface)]/50`: Tailwind cannot compose alpha onto an arbitrary CSS-var color.

### D10: Drop inline subcard labels

The original `SessionOpenSpecActions` and `SessionFlowActions` rendered an inline `OpenSpec:` / `Flows:` muted-text label as the first child. Once each component sits inside a titled subcard the label is redundant and visually competes with the legend. All three `OpenSpec:` instances and the single `Flows:` instance removed.

### D11: Drop the FLOWS internal divider

`SessionFlowActions` opened with `<div className="mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">` to separate itself from sibling content in the previous flat layout. Inside a subcard the divider creates a visual line through the FLOWS panel. Removed (replaced with bare `<div>`).

### D12: Plugin slot routing per subcard

After wrapping `SessionCardActionBarSlot` inside WORKSPACE, the orphaned `🧠` Honcho icons remained outside any subcard. Two routing options considered:

- **(a) Filter by `pluginId` at the slot consumer.** Rejected — hardcodes plugin identity in the dashboard, fragile.
- **(b) Add dedicated per-subcard slots and let plugins claim them.** Chosen.

New slots in this PR (base UI):
- `session-card-memory` (multiplicity `many`, payloadTier `react-only`) — reserved for memory plugins; rendered inside MEMORY subcard. **No plugin claims it in this PR.**
- `workspace-action-bar` (multiplicity `many`, payloadTier `react-only`) — rendered inside WORKSPACE subcard.

The pre-existing generic `session-card-action-bar` slot stays defined as a card-footer escape hatch (currently unclaimed by jj after its reroute; still claimed by honcho until the honcho-specific change lands).

Plugin manifest reroute landed in this PR:
- `jj-plugin`: `JjActionBar` + `JjInitAffordance` → `workspace-action-bar`.

Deferred to a separate honcho-scoped change (kept out of base UI commit per scope discipline):
- `honcho-plugin`: `HonchoBadge` (`session-card-badge` → `session-card-memory`) + `HonchoCardActions` (`session-card-action-bar` → `session-card-memory`). Until that change lands, Honcho's badge renders inside WORKSPACE via the generic `session-card-badge` slot, and the MEMORY subcard remains hidden.

### D13: Drag handle via context, not cloneElement

First attempt forwarded dnd-kit's `attributes` + `listeners` from `SortableSessionCard` into `SessionCard` via `React.cloneElement`. Failed silently because `SortableSessionCard`'s children include both `<SessionCard>` AND a sibling resume-error banner — `children` is an array, `React.isValidElement(children)` returns false, cloneElement is skipped.

Switched to a React context (`DragHandleCtx`). `SortableSessionCard` provides; `SessionCard` consumes via `useSessionCardDragHandle()` and spreads on its left gutter. Same pattern applied to folders: `SortablePinnedGroup` provides `FolderDragHandleCtx`; `FolderDragGutter` consumes.

### D14: Drop the explicit drag-handle icon overlay

The absolute-positioned `mdiDragHorizontalVariant` icon overlay (opacity-0 until group hover) is removed in both `SortableSessionCard` and `SortablePinnedGroup`. The drag zone is now a region of the visible card itself — the existing left gutter (status icon column for cards; chevron column for folders). No additional space is consumed.

### D15: Source icon replaces the round status dot

User feedback: the dot is generic. Replaced with the source-specific MDI icon (`sourceIcons[session.source]`: TUI=console, dashboard=robot, tmux=application, Zed=code-tags), colored by **status** rather than source. Implementation:

```ts
const iconStatusColor = session.status === "ended"
  ? "text-[var(--text-muted)]"
  : dotColor.replace(/\bbg-(?!\[)/g, "text-");  // bg-green-500 → text-green-500
```

The regex's negative lookahead `(?!\[)` skips arbitrary CSS-var bg classes (`bg-[var(--bg-surface)]` would otherwise become `text-[var(--bg-surface)]` and alias text color to a background variable). Ended sessions get an explicit muted token instead of the now-skipped CSS-var.

Applied to both desktop and mobile branches. The source label remains discoverable via `title="<Source> — <status>"` tooltip on the icon span.

### D16: Folder header restructured into gutter + content columns

Mirrors the SessionCard structure. `SessionList`'s pinned-folder header changed from:

```
<div onClick={toggle}>          // whole row toggles
  <Row>chevron + name + pin</Row>
  <Row className="ml-5">branch</Row>
  <Row className="ml-5">action bar</Row>
  <FolderOpenSpecSection ml-5 />
</div>
```

to:

```
<div className="flex gap-1.5">  // no row-level onClick
  <FolderDragGutter>             // chevron at top + drag area below
  <div className="flex-1">       // content column
    <Row>name + pin</Row>        // no ml-5 needed
    <Row>branch</Row>
    <Row>action bar</Row>
    <FolderOpenSpecSection />    // internal ml-5 indents also removed
  </div>
</div>
```

Consequences:
- Click-to-toggle is now **chevron-only** (the chevron button stops `pointerDown` propagation so the surrounding drag listener doesn't compete).
- All content shifts left to a single consistent column — `ml-5` / `ml-3` indents in `SessionList.tsx` and `FolderOpenSpecSection.tsx` removed.
- The drag zone is the empty space below the chevron in the gutter column — cursor: `grab` on hover.
- Outer card padding tightened (`p-2` → `p-1.5`, inner `px-2 py-1.5` → `px-1 py-1`).

## Open Questions

- None blocking. (MEMORY contents are deliberately deferred to a future change; this PR only reserves the slot.)
- Mobile drag-handle on session cards: pre-existing overlay was the only mobile drag affordance; removing it loses mobile reorder. Acceptable per user trajectory but not formally re-confirmed.
