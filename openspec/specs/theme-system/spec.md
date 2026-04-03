## ADDED Requirements

### Requirement: CSS custom properties for theming
The dashboard SHALL define CSS custom properties on `:root` for all color values used across components. Dark values SHALL be the default. Light values SHALL be defined under `[data-theme="light"]`.

#### Scenario: Dark mode colors applied by default
- **WHEN** no `data-theme` attribute is set on `<html>`
- **THEN** all components use dark palette colors via CSS variables

#### Scenario: Light mode colors applied
- **WHEN** `data-theme="light"` is set on `<html>`
- **THEN** all components use light palette colors via CSS variables

### Requirement: Three-state theme preference
The dashboard SHALL support three theme preferences: System, Light, and Dark.

#### Scenario: System mode follows OS preference
- **WHEN** theme is set to "system" and OS is in light mode
- **THEN** the dashboard uses light theme

#### Scenario: System mode follows OS dark preference
- **WHEN** theme is set to "system" and OS is in dark mode
- **THEN** the dashboard uses dark theme

#### Scenario: Light mode override
- **WHEN** theme is set to "light"
- **THEN** the dashboard uses light theme regardless of OS preference

#### Scenario: Dark mode override
- **WHEN** theme is set to "dark"
- **THEN** the dashboard uses dark theme regardless of OS preference

### Requirement: Theme persistence
The theme preference SHALL be persisted to `localStorage` and restored on page reload.

#### Scenario: Preference persisted
- **WHEN** user selects "light" theme and reloads the page
- **THEN** the dashboard loads in light theme

#### Scenario: Default preference
- **WHEN** no preference is stored in localStorage
- **THEN** the dashboard defaults to "system" mode

### Requirement: Theme toggle UI
A three-state toggle (System / Light / Dark) SHALL be displayed in the session list header area.

#### Scenario: Toggle changes theme
- **WHEN** user clicks the Light option in the toggle
- **THEN** the theme switches to light mode immediately

### Requirement: Component migration to CSS variables
All hardcoded Tailwind color classes in client components SHALL be replaced with CSS variable references. Syntax-highlighted code blocks SHALL use `var(--bg-code)` as their background color, overriding the syntax theme's embedded background.

#### Scenario: No hardcoded dark-only colors remain
- **WHEN** any component renders
- **THEN** it uses `var(--*)` CSS variables for backgrounds, text, and borders instead of hardcoded gray/black classes

#### Scenario: Syntax highlighter background matches theme
- **WHEN** a syntax-highlighted code block renders under any named theme
- **THEN** the code block background SHALL be `var(--bg-code)` from the active theme, not the syntax theme's embedded background color
