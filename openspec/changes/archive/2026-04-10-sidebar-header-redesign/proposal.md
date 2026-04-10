# Sidebar Header Redesign

## Problem

The sidebar header crams 10 elements into a single row:

1. π logo (home link)
2. ThemePicker (color theme dropdown)
3. ThemeToggle (light/system/dark 3-button group)
4. "Active only" toggle
5. "Show hidden" toggle
6. Pin+ button (pin directory dialog)
7. InstallButton (PWA install, conditional)
8. TunnelButton (tunnel/QR)
9. ServerSelector (switch dashboard servers)
10. Settings ⚙️ (navigates to settings page)

This makes the header feel cluttered and hard to scan, especially on narrower sidebar widths.

## Solution

Split the header into two rows with clear purpose:

```
┌──────────────────────────────────────────────────┐
│ Row 1 — App bar (navigation & app-level)         │
│  π    🎨 [☀️|🖥️|🌙]         🔗  ⬇️  🖥️▾  ⚙️     │
│                                                  │
│ Row 2 — Filter bar (session filtering & workspace)│
│  [Active only] [Show hidden]              📌+    │
└──────────────────────────────────────────────────┘
```

### Row 1 — App bar
Navigation and app-level actions, grouped by function:

| Group | Items | Purpose |
|-------|-------|---------|
| Brand | π logo | Home link |
| Appearance | ThemePicker, ThemeToggle | Visual preferences |
| Connectivity | TunnelButton, InstallButton, ServerSelector | Network/app access |
| Settings | ⚙️ gear | Settings page |

- Compact: smaller icons, tighter padding (~32px height)
- Conditional items (InstallButton, ServerSelector) appear/disappear without layout disruption since there's more room

### Row 2 — Filter bar
Session filtering and workspace actions:

| Side | Items | Purpose |
|------|-------|---------|
| Left | "Active only", "Show hidden" toggles | Session filters |
| Right | 📌+ pin button | Workspace action |

- Normal sizing with breathing room (~28px height)
- Total height ~60px vs current ~44px — a modest 16px increase for much better readability

## Scope

- Restructure header JSX in `SessionList.tsx` into two rows
- Adjust spacing/sizing for compact row 1
- No functionality changes — same elements, same behavior, just reorganized

## Out of scope

- Moving items to Settings panel
- Overflow menus or progressive disclosure
- Mobile sidebar layout changes (separate concern)
