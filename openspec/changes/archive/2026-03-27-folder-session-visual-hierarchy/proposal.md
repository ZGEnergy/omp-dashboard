## Why

Folder group headers and session cards are not visually distinguishable. The folder header uses a barely-visible `bg-hover` background with a flat `border-b`, while session cards have `rounded-xl`, `shadow-md`, and borders — making the contents more prominent than the container. There is no visual nesting: folders and sessions appear at the same level.

## What Changes

- Wrap each folder group (header + sessions) in a single container element with a subtle background (`--bg-secondary`), rounded corners, and padding — creating visible containment
- Add spacing (gap/margin) between folder group containers so they read as separate blocks
- Give session cards an explicit `--bg-tertiary` background to complete the 3-tier color layering: sidebar (`--bg-primary`) → folder (`--bg-secondary`) → session (`--bg-tertiary`)
- Remove the old `border-b` separator on folder headers since spacing + background handles separation

## Capabilities

### New Capabilities

_None — this is a styling refinement, not a new capability._

### Modified Capabilities

- `session-grouping`: Folder groups become visible containers with distinct background, rounded corners, and inter-group spacing
- `sleek-card-design`: Session cards get explicit `--bg-tertiary` background to layer correctly inside folder containers

## Impact

- `src/client/components/SessionList.tsx` — `renderGroup` function: wrap folder header + session list in a container element with background/padding/rounding
- `src/client/components/SessionCard.tsx` — add explicit `bg-[var(--bg-tertiary)]` to session card `<li>`
- No new CSS variables needed — uses existing `--bg-primary`, `--bg-secondary`, `--bg-tertiary` palette
- Both dark and light themes already define these values, so both themes benefit automatically
