## ADDED Requirements

### Requirement: PiLogo is a reusable inline-SVG brand-mark component
The dashboard SHALL provide a `PiLogo` React component at `packages/client/src/components/PiLogo.tsx` that renders the bold geometric Π brand mark as inline SVG. The component SHALL accept optional `size` (numeric, default 24), `className`, and `title` props. The SVG SHALL use `fill="currentColor"` so it inherits the surrounding text color, and SHALL expose `role="img"` with the `title` value as `aria-label`. The SVG SHALL have no opaque background fill — only the brand-mark glyph rectangles SHALL be painted.

#### Scenario: PiLogo renders inline SVG with currentColor
- **WHEN** `<PiLogo />` is rendered
- **THEN** the output is an `<svg>` element (not an `<img>`)
- **AND** the SVG has `fill="currentColor"`
- **AND** the SVG has `role="img"` and `aria-label="Pi Dashboard"` (default title)

#### Scenario: PiLogo accepts custom size
- **WHEN** `<PiLogo size={32} />` is rendered
- **THEN** the SVG `width` and `height` attributes are both `32`

#### Scenario: PiLogo accepts custom title for aria-label
- **WHEN** `<PiLogo title="Home" />` is rendered
- **THEN** the SVG `aria-label` is `"Home"`

#### Scenario: PiLogo is theme-transparent
- **WHEN** PiLogo renders inside any container
- **THEN** the SVG paints only the Π glyph (rectangles) and no background fill
- **AND** the glyph color is determined by the inherited CSS `color` of the parent
