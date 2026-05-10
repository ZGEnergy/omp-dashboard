# session-card-status — Delta

## ADDED Requirements

### Requirement: Session card left gutter SHALL render a status-tinted capsule rail with an icon chip

The session card's left gutter (a 20 px-wide column that hosts the source icon and doubles as the drag handle) SHALL render a **status-tinted vertical capsule rail** centered in the gutter, with the source icon presented in a **circular chip** sitting above the rail at its top. The rail and chip together replace any earlier full-width gutter fill, slim 2 px line, or mosaic mask treatment.

The rail SHALL be 6 px wide (`w-1.5`), centred horizontally (`left-1/2 -translate-x-1/2`), inset bottom (`bottom-2`), and offset from the top (`top-7`) so it begins below the icon chip with a small visual gap. Both ends SHALL be `rounded-full` so the bar reads as a capsule. It SHALL use a single Tailwind alpha-modified background-color class and SHALL NOT animate, gradient, or use any mask/pattern. Its colour SHALL match the card's status, mirroring the precedence rules of `deriveDotColorWithFlags` (resuming > hasError > isRetrying > status) so the status dot, source icon tint, and rail always agree.

The gutter container SHALL keep its drag-handle wiring (`dragHandleProps` spread when provided by `SortableSessionCard`), `cursor-grab` / `active:cursor-grabbing` cursor classes, and the `data-testid="drag-handle-session"` attribute. The rail bar is rendered as an absolutely-positioned `<span aria-hidden="true">` so it does not interfere with hit-testing.

The source icon SHALL be wrapped in a **circular chip** (`w-4 h-4 rounded-full bg-[var(--bg-tertiary)] shadow-sm z-10`) layered above the rail bar so the icon stays clearly distinguishable from the colored rail behind it. The chip's colour SHALL stay constant; the icon glyph inside it SHALL still carry the status palette colour from `deriveIconStatusColor`.

Existing body-level animations (`card-working-pulse`, `card-unread-pulse`) are unaffected and continue to render on the card body, layered above the rail.

#### Scenario: Status → rail color mapping
- **WHEN** a session card renders
- **THEN** the gutter background-color class is derived from a `deriveRailBgColor(session, flags, isSelected)` helper exported from `packages/client/src/lib/session-status-visuals.ts`
- **AND** `streaming` and `resuming` status, and the chat-panel `isRetrying` flag, SHALL all map to amber
- **AND** the chat-panel `hasError` flag SHALL map to red and SHALL take precedence over the underlying status
- **AND** `active` and `idle` status SHALL map to green
- **AND** `ended` status SHALL map to a muted surface token (`bg-[var(--bg-surface)]`) regardless of `isSelected`
- **AND** the precedence order SHALL match `deriveDotColorWithFlags` (resuming > hasError > isRetrying > status)

#### Scenario: Rail bar is a centered capsule
- **WHEN** the rail renders for a non-`ended` session
- **THEN** the rail bar element SHALL apply a Tailwind alpha-modified utility class of the form `bg-<palette>-500/40` (unselected) or `bg-<palette>-400/65` (selected)
- **AND** the rail bar element SHALL be 6 px wide (`w-1.5`), centred (`absolute left-1/2 -translate-x-1/2`), offset from the top (`top-7`) and inset from the bottom (`bottom-2`) so it starts below the icon chip
- **AND** the rail bar element SHALL be `rounded-full` so both ends form a capsule
- **AND** the rail bar SHALL NOT apply any `mask-image`, `clip-path`, gradient, or repeating background pattern

#### Scenario: Selected session card uses a brighter, more opaque rail tint
- **WHEN** a session card is the currently selected session (`isSelected === true`) and its status is not `ended`
- **THEN** the rail SHALL render with the `-400/65` palette (e.g. `bg-green-400/65` instead of `bg-green-500/40`, `bg-amber-400/65` instead of `bg-amber-500/40`)
- **AND** the existing card-level selection treatment (blue border, blue ring, blue background tint) SHALL remain unchanged

#### Scenario: Drag handle behavior preserved
- **WHEN** the rail is rendered on a card hosted inside `SortableSessionCard`
- **THEN** the gutter element SHALL still receive `dragHandleProps` (attributes + listeners) from `SortableSessionCard`
- **AND** the `data-testid="drag-handle-session"` attribute SHALL still be present
- **AND** the cursor SHALL still switch to `grab` on hover and `grabbing` while dragging

#### Scenario: Source icon sits in a circular chip above the rail bar
- **WHEN** the rail bar renders
- **THEN** the source icon SHALL be wrapped in a circular chip (`w-4 h-4 rounded-full bg-[var(--bg-tertiary)] shadow-sm`) layered above the rail bar via `z-10`
- **AND** the chip SHALL sit at the top of the gutter (preceding the rail bar in the flex flow)
- **AND** the icon glyph inside the chip SHALL carry the status palette text colour from `deriveIconStatusColor`
