## ADDED Requirements

### Requirement: Sidebar action button contrast
Sidebar action button icons (Pin directory, Install PWA, Tunnel, Settings) SHALL use `--text-tertiary` for their default color and `--text-secondary` for their hover color, ensuring a minimum WCAG AA non-text contrast ratio of 3:1 against the sidebar background in both light and dark themes.

#### Scenario: Light mode icon visibility
- **WHEN** the theme is light and the sidebar renders action buttons
- **THEN** each icon has a contrast ratio of at least 3:1 against `--bg-primary`

#### Scenario: Dark mode icon visibility
- **WHEN** the theme is dark and the sidebar renders action buttons
- **THEN** each icon has a contrast ratio of at least 3:1 against `--bg-primary`

#### Scenario: Hover state contrast
- **WHEN** the user hovers over a sidebar action button in any theme
- **THEN** the icon color changes to `--text-secondary`
