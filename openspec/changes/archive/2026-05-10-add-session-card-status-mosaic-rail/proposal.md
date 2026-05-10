## Why

The session card's left gutter (the drag-handle column at `SessionCard.tsx:455`) is a ~14px vertical strip holding only the source icon. It has zero visual weight and reads as dead space — yet it's the literal grab target for drag-to-reorder, and it occupies prime peripheral-vision real estate where status could be glanceable.

Today, status signal lives in:
- a colored dot/icon tint at the top of the gutter (small, easy to miss),
- a body-level pulse (only for `streaming` / `resuming` / `unread`).

Idle, waiting, ended, and error states are visually quiet — at a glance, an idle card and a waiting card look nearly identical until the user reads the secondary line. The user requested the gutter be made "visually more stunning and more fragmented".

## What Changes

### Add a status-tinted capsule rail with an icon chip to the gutter

Replace the transparent gutter background (`SessionCard.tsx`, the desktop `flex flex-col items-center w-3.5 ...` div) with a status-tinted vertical capsule rail and a circular icon chip:

- **Gutter**: widened from `w-3.5` (14 px) to `w-5` (20 px). Container picks up `pt-2 pb-2` and `relative` so the rail bar can be absolutely positioned inside it.
- **Rail bar**: an absolutely-positioned `<span aria-hidden="true">` centred in the gutter, 6 px wide (`w-1.5`), inset top and bottom (`top-2 bottom-2`), with `rounded-full` so both ends form a capsule. Background is a Tailwind alpha-modified status colour. No mosaic, no mask, no gradient, no animation.
- **Icon chip**: the mdi source icon sits at the top of the gutter, wrapped in a `w-4 h-4 rounded-full bg-[var(--bg-tertiary)] shadow-sm` circular chip layered above the rail bar via `z-10` so the icon reads clearly regardless of the rail tint.
- **Mapping**:

  | session state                  | rail color                       |
  |--------------------------------|----------------------------------|
  | `streaming` / `resuming`       | amber (matches existing pulse)   |
  | `active` / `idle`              | green                            |
  | `ended`                        | muted surface token (no tint)    |
  | error (chat-panel `hasError`)  | red                              |
  | retrying (`isRetrying`)        | amber                            |

  Single source of truth: extend `packages/client/src/lib/session-status-visuals.ts` with `deriveRailBgColor(session, flags, isSelected)` returning a Tailwind utility class string. Precedence mirrors `deriveDotColorWithFlags` so the dot, icon glyph, and rail always agree.

- **Selected state**: when the card is the selected session (`isSelected` prop) and status is not `ended`, the rail uses the brighter `-400/65` palette instead of `-500/40` (e.g. `bg-green-400/65` instead of `bg-green-500/40`). The existing card-level selection treatment (blue border, blue ring, blue background tint) is unchanged.

### Out of scope

- No new animation. The rail is **static**. Existing body-level pulses (`card-working-pulse`, `card-unread-pulse`) are unchanged and continue to render on the card body above the rail.
- No information encoding beyond status — only the **colour** carries meaning.
- No change to drag-handle behaviour. The gutter container still receives `dragHandleProps` (when provided by `SortableSessionCard`); `cursor-grab` / `active:cursor-grabbing` and `data-testid="drag-handle-session"` are preserved.
- Mobile rendering uses the existing mobile branch unchanged (rail is desktop-only for now).

## Impact

- **Affected specs**: `session-card-status` — new requirement added for the gutter rail.
- **Affected code**:
  - `packages/client/src/components/SessionCard.tsx` — desktop gutter rebuilt: wider container, absolutely-positioned rail bar `<span>`, icon wrapped in circular chip.
  - `packages/client/src/lib/session-status-visuals.ts` — new `deriveRailBgColor` exported (Tailwind class literals so the JIT picks them up).
- **No new assets** in the final design (an earlier mosaic-mask SVG was prototyped and removed).
- **No new dependencies**, no protocol changes, no server changes.
- **Test updates**: `packages/client/src/lib/__tests__/session-status-visuals.test.ts` and `packages/client/src/components/__tests__/SessionCard.test.tsx` — cover status × selected × flag mapping, the capsule rail's geometry classes, and the icon chip's circular dark-surface backing.
- **Performance**: no extra network request, no JS work, no animation cost.
