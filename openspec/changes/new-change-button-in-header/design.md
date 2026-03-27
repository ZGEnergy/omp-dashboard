## Context

The "+ New Change" button is currently at the bottom of the expanded OpenSpec section content, below all change cards. The "Bulk Archive" and refresh buttons are in the header row. Users want quick access to create new changes without scrolling past the list.

## Goals / Non-Goals

**Goals:**
- Move "+ New Change" to the header row, next to "Bulk Archive" and the refresh button

**Non-Goals:**
- Changing the button's behavior (it already sends `/opsx:new`)
- Changing the Bulk Archive behavior

## Decisions

### 1. Move button to header row

**Decision**: Move the "+ New Change" button from the expanded content area into the `flex items-center gap-1` div in the header that contains "Bulk Archive" and the refresh button. Remove it from the bottom of the expanded content.

**Rationale**: Simple relocation. The button is always visible when the header is visible, regardless of whether the section is expanded. This matches the "Bulk Archive" button placement.

### 2. Consistent styling

**Decision**: Style the "+ New Change" button to match "Bulk Archive" — same `text-[10px]` bordered button style, but with a green/blue accent on hover instead of orange.

**Rationale**: Visual consistency in the header row.

## Risks / Trade-offs

- **Header width**: Adding another button to the header row may crowd it on narrow screens. → Acceptable: the buttons are small and the header already wraps.
