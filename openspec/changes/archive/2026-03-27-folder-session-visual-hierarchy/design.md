## Context

The sidebar renders folder groups and session cards at nearly the same visual level. Folder headers use `bg-[var(--bg-hover)]` (barely visible) with a `border-b`, while session cards use `rounded-xl`, `shadow-md`, and `border-subtle`. The result is that contents appear more prominent than their container — inverted visual hierarchy.

The existing CSS variable palette already defines three tiers: `--bg-primary` (page), `--bg-secondary` (panels), `--bg-tertiary` (cards). Both dark and light themes have these values. The fix is to use them as intended for nesting.

## Goals / Non-Goals

**Goals:**
- Make folder groups visually distinct containers that clearly wrap their session cards
- Create a 3-tier color layering: sidebar → folder → session card
- Add whitespace between folder groups for clear separation
- Keep the change subtle — no harsh colors or heavy borders

**Non-Goals:**
- No new CSS variables or theme changes
- No layout restructuring beyond wrapping the folder group in a container element
- No changes to session card content, interactions, or existing functionality

## Decisions

### 1. Folder container wrapper
**Decision**: Wrap the folder header `<li>` and session children `<div>` in a single `<div>` container with `bg-[var(--bg-secondary)]`, `rounded-lg`, and padding.

**Rationale**: Currently `renderGroup` returns a `<React.Fragment>` with the header and children as siblings — no visual containment. A wrapping element is the minimal structural change needed to create a visible container.

**Alternative considered**: Adding a left border accent to the folder header only. Rejected because it doesn't create containment — sessions still float below unconnected.

### 2. Session card explicit background
**Decision**: Add `bg-[var(--bg-tertiary)]` to the session card `<li>` element.

**Rationale**: Cards currently rely on shadow alone for visual presence. With folders getting `--bg-secondary`, cards need an explicit `--bg-tertiary` to create the layering step. Without it, cards would inherit the folder's `--bg-secondary` and look flat.

### 3. Inter-group spacing
**Decision**: Add `space-y-2` (or equivalent gap) on the parent list to separate folder blocks.

**Rationale**: Whitespace is the gentlest separator. Combined with the container background, it clearly delineates groups without needing heavy borders or dividers.

### 4. Remove old border-b separator
**Decision**: Remove `border-b border-[var(--border-primary)]` from the folder header `<li>`.

**Rationale**: The container background + spacing handles separation. The old border-b created a harsh line between header and content within the same group.

## Risks / Trade-offs

- **Slightly more vertical space** → Padding and inter-group gaps will increase sidebar height. Acceptable tradeoff for clarity.
- **SortablePinnedGroup wrapper** → Pinned groups are wrapped in `<SortablePinnedGroup>` for drag-and-drop. The new container div must be inside this wrapper or the wrapper itself must be styled. Need to check that drag handles still work correctly.
