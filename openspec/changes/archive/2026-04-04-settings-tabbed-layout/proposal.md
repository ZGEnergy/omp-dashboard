## Why

The Settings panel is a single long scrollable page with 8 sections. As more settings are added over time, this becomes unwieldy. The header with Save/Restart buttons scrolls away, forcing users to scroll back up to save. Sections that are conceptually unrelated (e.g., server ports and OAuth providers) sit in one undifferentiated list.

## What Changes

- **Tabbed layout**: Split the settings page into tabs so related settings are grouped and the page isn't one giant scroll.
- **Fixed header**: The header (back button, title, Restart, Save) and tab bar stay pinned at the top. Only the active tab's content scrolls.
- **Tab structure** (4 tabs):
  - **General**: Server (ports, auto-shutdown), Sessions (spawn strategy), Tunnel, Developer (dev build on reload)
  - **Providers**: Provider Authentication (OAuth login buttons — ProviderAuthSection) + LLM Providers (custom endpoints)
  - **Security**: OAuth dashboard access config (GitHub/Google/Keycloak/OIDC providers, allowed users, bypass URLs, trusted hosts)
  - **Advanced**: Memory Limits (max events, string truncation, WS buffer)

## Capabilities

### Modified Capabilities
- `settings-panel`: Refactor SettingsPanel from single scroll to tabbed layout with fixed header

## Impact

- **Client only** — no server, bridge, or protocol changes
- **SettingsPanel.tsx**: Major refactor — extract tab content into sections, add tab state, restructure CSS for fixed header + scrollable content
- **No new dependencies** — tabs are simple buttons with conditional rendering
- **URL state** (optional): Tab selection could be persisted in URL hash (e.g., `#providers`) so refresh/deep-link preserves the active tab
