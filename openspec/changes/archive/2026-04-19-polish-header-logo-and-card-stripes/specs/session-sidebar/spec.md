## ADDED Requirements

### Requirement: Sidebar header brand mark (PiLogo)
The sidebar header SHALL display the Pi brand mark via a shared inline-SVG React component (`PiLogo`) that links to home (`/`), instead of a literal `π` text character, a raster `<img>`, or the static "Sessions" text. Both sidebar implementations — the desktop sidebar header in `SessionList.tsx` and the alternate sidebar header in `SessionSidebar.tsx` — SHALL use the same `PiLogo` component. The SVG SHALL use `fill="currentColor"` so it inherits the surrounding text color (no opaque background, fully transparent in both light and dark themes), and SHALL expose `role="img"` with `aria-label="Pi Dashboard"`. The wrapping `<button>` SHALL retain `title="Home"`, click-to-home navigation, and theme-color styling (`text-blue-500 hover:text-blue-400 transition-colors`). Filter controls (theme picker, active only, show hidden, pin folder) SHALL remain in the header row.

#### Scenario: Header displays Pi branding via PiLogo SVG
- **WHEN** the sidebar is rendered
- **THEN** the header home button contains an `<svg>` element with `aria-label="Pi Dashboard"`
- **AND** the button links to `/` alongside the existing filter controls

#### Scenario: Header brand element is not a text glyph or raster image
- **WHEN** the sidebar is rendered
- **THEN** the home button does NOT contain an `<img>` element
- **AND** no literal "π" text node is rendered inside the button
- **AND** the text "Sessions" does not appear in the sidebar header

#### Scenario: Brand button still navigates home
- **WHEN** the user clicks the sidebar header brand button
- **THEN** the client navigates to `/` (the dashboard home route)

#### Scenario: Brand mark inherits theme color
- **WHEN** the dashboard is in light theme
- **THEN** the PiLogo SVG renders with no opaque background and inherits the parent button's `text-blue-500` color
- **WHEN** the dashboard is in dark theme
- **THEN** the PiLogo SVG renders with no opaque background and inherits the parent button's `text-blue-500` color

#### Scenario: Brand button has hover affordance
- **WHEN** the user hovers the sidebar header brand button
- **THEN** the SVG visually responds via the button's `hover:text-blue-400` color transition
- **AND** the `title="Home"` tooltip is exposed for assistive technologies
