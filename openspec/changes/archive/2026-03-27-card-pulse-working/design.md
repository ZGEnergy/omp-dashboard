## Context

Session cards in `SessionCard.tsx` render as `<li>` elements with `bg-[var(--bg-tertiary)]`. The `streaming` status and `resuming` flag currently only affect a 2px dot in the left gutter. The card itself has no visual differentiation for working state.

## Goals / Non-Goals

**Goals:**
- Make working sessions (streaming/resuming) instantly scannable via a full-card background pulse
- Keep the change minimal — only touch the card's `<li>` class and add one CSS keyframe

**Non-Goals:**
- Changing the existing status dot behavior
- Adding new status states or modifying the status state machine
- Theming the pulse color via CSS variables (can be done later)

## Decisions

### 1. CSS keyframe in `index.css` over inline Tailwind animation

Tailwind's `animate-pulse` uses opacity which would affect all card content. A custom `@keyframes` targeting `background-color` gives precise control over the tint color and timing. Placed in `index.css` alongside any other custom animations.

**Animation**: `card-working-pulse` — 3s ease-in-out infinite cycle between `transparent` and `rgba(234, 179, 8, 0.06)` (faint amber).

### 2. Conditional class on `<li>` element

Add the animation class when `session.status === "streaming"` or `session.resuming === true`. This is a single ternary/conditional in the existing className expression — no structural changes to the component.

## Risks / Trade-offs

- [Multiple working sessions] → Many pulsing cards could feel busy, but the tint is subtle enough (0.06 opacity) to avoid distraction.
- [Theme compatibility] → The amber tint uses a fixed rgba value. Works well on dark themes; on very light themes the pulse may be barely visible. Acceptable for now.
