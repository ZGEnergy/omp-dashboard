## Why

The cold-start recovery offer ("Reopen N sessions?") renders with two CSS custom
properties that are not defined in the theme: `--bg-elevated` and `--accent`.
Undefined tokens resolve to nothing, so the card paints see-through (no panel
background) and the primary "Reopen" button paints with no background (invisible),
leaving users a recovery prompt they cannot act on. The bug shipped with
`reopen-sessions-after-shutdown` (PR #210) and has no fix.

## What Changes

- Replace `var(--bg-elevated)` with `var(--bg-surface)` on the recovery-offer card
  in `RecoveryOfferHost.tsx` so the panel paints an opaque elevated surface.
- Replace `var(--accent)` with `var(--accent-primary)` on the "Reopen" button so it
  paints the theme blue and is visible/clickable.
- Add a regression test asserting the component references only theme-defined tokens
  (no `--bg-elevated` / `--accent`).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `shutdown-session-recovery`: the recovery offer's visible-affordance requirement —
  the offer card and its Reopen action MUST render with defined theme tokens so both
  the panel background and the primary action are visible.

## Impact

- Code: `packages/client/src/components/RecoveryOfferHost.tsx` (2 token references).
- Tests: new test under `packages/client/src/components/` (or existing recovery test file).
- No API, protocol, persistence, or dependency changes. Client-only, cosmetic-token fix.
- Rebuild path: client change → `npm run build` + server restart (per Build & Restart Workflow).
