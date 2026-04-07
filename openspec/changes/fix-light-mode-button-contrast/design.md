## Context

The sidebar header contains four action buttons (Pin directory, Install PWA, Tunnel, Settings) that all use `text-[var(--text-muted)]` for their icon color. In light mode `--text-muted` resolves to `#aaaaaa` on a `#ffffff` background, yielding ~2.3:1 contrast — below the WCAG AA 3:1 threshold for non-text elements. The Install button is particularly affected because it's a small download icon with no label.

## Goals / Non-Goals

**Goals:**
- All sidebar action button icons meet WCAG AA non-text contrast (≥3:1) in both light and dark themes
- Minimal change — swap one CSS variable reference, no structural changes

**Non-Goals:**
- Auditing all `--text-muted` usage across the entire app (only sidebar action buttons are affected here)
- Changing the `--text-muted` variable values themselves (they serve their purpose for truly muted/disabled content)

## Decisions

### Use `--text-tertiary` instead of `--text-muted`

**Choice:** Replace `text-[var(--text-muted)]` with `text-[var(--text-tertiary)]` on sidebar action buttons.

**Rationale:** `--text-tertiary` is `#808080` (dark) / `#777777` (light), giving ~5.6:1 and ~4.5:1 contrast respectively. It's the next step up in the existing text hierarchy and already used for "labels, secondary info" — appropriate for interactive icon buttons. No new variables or overrides needed.

**Alternative considered:** Creating a dedicated `--text-icon` variable. Rejected — adds complexity for no benefit when `--text-tertiary` already fits the semantics.

## Risks / Trade-offs

- [Visual change in dark mode] Icons become slightly brighter (`#585858` → `#808080`). This is an improvement — the buttons were arguably too dim in dark mode as well. → Acceptable trade-off.
