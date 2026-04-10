## Context

The sidebar header in `SessionList.tsx` renders 10 elements in a single flex row: π logo, ThemePicker, ThemeToggle (3-button group), "Active only" toggle, "Show hidden" toggle, Pin+ button, InstallButton (conditional), TunnelButton, ServerSelector (headerExtra), and Settings gear.

All elements share `flex gap-1 items-center` in a single `justify-between` container. The π logo is on the left, everything else is packed right. At typical sidebar widths (280-350px), this creates visual clutter and makes individual controls hard to target.

The header is a single `<div className="p-3 border-b">` containing one row.

## Goals / Non-Goals

**Goals:**
- Split the header into two visually distinct rows
- Group controls by purpose: app-level (row 1) vs session filtering (row 2)
- Maintain all existing functionality — no features added or removed
- Keep total height increase modest (~16px)

**Non-Goals:**
- Moving controls to Settings or behind overflow menus
- Changing mobile sidebar layout (MobileOverlay has its own header)
- Adding new controls or changing existing control behavior
- Changing the ThemeToggle or ThemePicker component internals

## Decisions

### Two-row layout with semantic grouping

Row 1 ("app bar") contains navigation and app-level controls:
- Left: π logo, ThemePicker, ThemeToggle
- Right: InstallButton, TunnelButton, ServerSelector (headerExtra), Settings ⚙️

Row 2 ("filter bar") contains session list controls:
- Left: "Active only" toggle, "Show hidden" toggle
- Right: Pin+ button

**Rationale**: The current single row mixes concerns — theme settings sit next to session filters. Separating by function makes the header scannable. Row 1 is "set and forget" controls, row 2 is controls you interact with during a session. Within row 1, theme controls sit next to the logo (left) since they're visual identity, while connectivity/settings sit right.

The ThemePicker dropdown opens left-aligned and the ServerSelector dropdown opens right-aligned to prevent overflow outside the sidebar.

### Compact row 1, normal row 2

Row 1 uses tighter padding (`py-1.5 px-3`) since its controls are icon-heavy and rarely need tap targets as large as the filter toggles.

Row 2 uses current padding (`py-1.5 px-3`) since the text toggle buttons benefit from normal sizing.

Only the outer container changes — individual component styling stays the same.

**Rationale**: Keeps total header height around 60px (vs current ~44px). The 16px increase is a fair trade for decluttering.

### Single border-b on the container

Both rows share one `border-b` wrapper. No divider between row 1 and row 2 — they're visually separated by the row break and different content types.

**Rationale**: A divider between rows would add visual noise. The grouping is self-evident.

## Risks / Trade-offs

- **[Slightly taller header]** → ~16px more vertical space used. Acceptable given the sidebar is typically 800px+ tall.
- **[Narrow sidebar widths]** → Row 1 has ~7 icon buttons which may still feel tight below 250px. Mitigation: conditional items (InstallButton, ServerSelector) only appear when relevant, so typical count is 5-6.
- **[Test updates]** → Any snapshot or integration tests that reference the header structure will need updating. Mitigation: changes are contained to one JSX block in SessionList.tsx.
