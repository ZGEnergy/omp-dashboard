## Why

Working sessions are indicated by a tiny 2px yellow pulsing dot in the card's left gutter. This is hard to spot at a glance, especially when scanning multiple sessions across folders. The whole card should visually pulse to make working sessions instantly detectable.

## What Changes

- Add a slow pulsing background tint animation to session cards when the session is in `streaming` or `resuming` state
- The card background will subtly shift between the neutral `--bg-tertiary` and a faint amber tint on a slow cycle
- The existing yellow status dot remains unchanged

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `sleek-card-design`: Add requirement for full-card background pulse animation on streaming/resuming sessions

## Impact

- `src/client/components/SessionCard.tsx` — conditional animation class on the `<li>` element
- `src/client/index.css` — new `@keyframes` for the background tint pulse
