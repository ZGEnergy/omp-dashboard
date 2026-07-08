## Context

`RecoveryOfferHost.tsx` renders the cold-start "Reopen N sessions?" offer. It uses
Tailwind arbitrary-value classes bound to CSS custom properties:
`bg-[var(--bg-elevated)]` on the card and `bg-[var(--accent)]` on the Reopen button.
Neither `--bg-elevated` nor `--accent` is declared in `packages/client/src/index.css`
(which defines `--bg-surface` and `--accent-primary` instead). Undefined custom
properties resolve to the empty string, so `background` is unset: the card is
transparent and the button is invisible. Structure, a11y roles, and testids are all
correct — only the paint fails.

## Goals / Non-Goals

**Goals:**
- Card paints an opaque elevated surface in both themes.
- Reopen button paints the theme accent and is clearly clickable.
- Prevent regression via a test that fails if the component references undeclared tokens.

**Non-Goals:**
- No redesign of the offer layout, placement, copy, or behavior.
- No change to the recovery classification / bus / resume flow.
- No new theme tokens introduced.

## Decisions

- **Use existing tokens, not new ones.** Map `--bg-elevated` → `--bg-surface`
  (`#2a2a2a` dark / `#e0e0e0` light, documented as "elevated surfaces") and
  `--accent` → `--accent-primary` (`#3b82f6`). Rationale: the theme already carries
  the right semantics; adding aliases would grow the token surface for one call site.
  Alternative considered: declare `--bg-elevated`/`--accent` aliases in index.css —
  rejected as unnecessary indirection.
- **Regression guard via source-string assertion.** A unit test reads the component
  source (or renders it) and asserts it references `--bg-surface` / `--accent-primary`
  and NOT `--bg-elevated` / `--accent`. Cheap, deterministic, catches reintroduction.

## Risks / Trade-offs

- [Token renamed later] → test asserts the current token names; a future rename updates
  both component and test together, which is the intended coupling.
- [Contrast in light theme] → `--accent-primary` blue with white text and `--bg-surface`
  `#e0e0e0` card both clear WCAG AA (verified in mock); no contrast risk.

## Migration Plan

Client-only change. Deploy: `npm run build` + server restart. Rollback: revert the two
token references. No data or protocol migration.

## Open Questions

None.
