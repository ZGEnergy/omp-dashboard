## MODIFIED Requirements

### Requirement: Component migration to CSS variables
All hardcoded Tailwind color classes in client components SHALL be replaced with CSS variable references. Syntax-highlighted code blocks SHALL use `var(--bg-code)` as their background color, overriding the syntax theme's embedded background.

#### Scenario: No hardcoded dark-only colors remain
- **WHEN** any component renders
- **THEN** it uses `var(--*)` CSS variables for backgrounds, text, and borders instead of hardcoded gray/black classes

#### Scenario: Syntax highlighter background matches theme
- **WHEN** a syntax-highlighted code block renders under any named theme
- **THEN** the code block background SHALL be `var(--bg-code)` from the active theme, not the syntax theme's embedded background color
