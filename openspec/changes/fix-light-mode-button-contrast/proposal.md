## Why

Sidebar action buttons (Install, Tunnel, Settings, Pin directory) use `--text-muted` for their icon color. In light mode, `--text-muted` is `#aaaaaa` on a `#ffffff` background — a contrast ratio of ~2.3:1, which fails WCAG AA for non-text elements (3:1 minimum). The Install button in particular appears invisible. In dark mode these buttons are fine (`#585858` on `#0a0a0a` ≈ 3.5:1).

## What Changes

- Bump sidebar action button icon color from `--text-muted` to `--text-tertiary` in `InstallButton.tsx`, `TunnelButton.tsx`, and the Settings/Pin buttons in `SessionList.tsx`
- `--text-tertiary` is `#808080` (dark) / `#777777` (light), giving ≥4.5:1 contrast in both themes

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `theme-system`: Action button icons must meet WCAG AA non-text contrast (3:1) in both light and dark themes

## Impact

- `src/client/components/InstallButton.tsx` — icon color class
- `src/client/components/TunnelButton.tsx` — icon color class
- `src/client/components/SessionList.tsx` — Settings and Pin directory button color classes
- No API, dependency, or behavioral changes
