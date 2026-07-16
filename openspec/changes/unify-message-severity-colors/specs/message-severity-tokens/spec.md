## ADDED Requirements

### Requirement: Severity tokens are a derived triple set
The client SHALL define, in `index.css` (NOT via `applyThemeVars`/`CSS_VAR_KEYS`), a `--severity-<level>-{bg,fg,border}` triple for each of `error | warning | success | info | neutral`. Each triple SHALL derive from a single base accent (`--accent-red/orange/green/blue` or `--text-muted`) via `color-mix`, where `bg` mixes into `--bg-tertiary` and `fg` mixes toward `--text-primary` (both theme-aware tokens), so one formula resolves correctly in every theme. The tokens SHALL NOT reference a nonexistent variable such as `--bg-card`. This set SHALL be the single color source of truth for every message surface.

#### Scenario: Triple preserves the muted box look
- **WHEN** a message surface applies `--severity-error-{bg,fg,border}`
- **THEN** the result SHALL be a muted translucent box (comparable to the prior `bg-red-900/90 text-red-200 border-red-800`), NOT a saturated solid-accent fill

#### Scenario: Severity → base accent mapping
- **WHEN** the token set is defined
- **THEN** `error` SHALL derive from `--accent-red`, `warning` from `--accent-orange`, `success` from `--accent-green`, and `info` from `--accent-blue` via color-mix

#### Scenario: neutral uses literal base tokens, not a mix
- **WHEN** the `neutral` triple is defined
- **THEN** it SHALL map to the existing `--bg-tertiary` / `--text-secondary` / `--border-primary` tokens directly (the proven subdued look), NOT a `color-mix` from `--text-muted` (which fails WCAG AA)

#### Scenario: close button reuses fg
- **WHEN** a toast renders its dismiss (×) button
- **THEN** its color SHALL be the variant's `-fg` at reduced opacity, NOT a separate token or raw literal

#### Scenario: Tokens resolve in every theme
- **WHEN** any theme (including light) is active
- **THEN** all five triples SHALL resolve to defined colors, deriving from theme-aware accents so named-theme overrides flow without per-surface edits

### Requirement: info does not reuse the protocol notice token
`--severity-info` SHALL be an independent token deriving from `--accent-blue`. It SHALL NOT be aliased to `--status-notice` (a protocol signal meaning "model returned reasoning only"), so the two semantics stay separable.

#### Scenario: info and notice are distinct tokens
- **WHEN** `index.css` is inspected
- **THEN** `--severity-info` and `--status-notice` SHALL be separate declarations (they MAY share `--accent-blue` as a source)

### Requirement: Warning is visually distinct from working
The `warning` severity SHALL use orange (`--accent-orange`), NOT the yellow used by `--status-working`.

#### Scenario: Warning does not reuse working-yellow
- **WHEN** a `warning` surface and a `working` status surface are visible together
- **THEN** their colors SHALL differ (orange vs yellow)

### Requirement: No raw severity color literals in message components
Message components — `Toast.tsx`, `SpawnErrorToastHost.tsx`, `SpawnErrorBanner.tsx`, and `extension-ui/ToastSlot.tsx` — SHALL source severity color from `--severity-*` tokens, NOT from raw Tailwind literals (`bg-red-900`, `bg-amber-500`, etc.). `ToastSlot` SHALL keep its protocol `level` names while mapping them onto the shared tokens.

#### Scenario: Component inspection finds no hardcoded severity color
- **WHEN** the four message components are inspected
- **THEN** severity backgrounds/borders/text SHALL derive from `--severity-*` (directly or via a class map), not inline `red-900`/`amber-500`/`red-500` literals

### Requirement: Derived triples meet WCAG AA across all themes
Each `--severity-<level>-fg` on its `--severity-<level>-bg` SHALL clear WCAG AA across all 9 named themes (base, dracula, nord, github, catppuccin, tokyo-night, rose-pine, solarized, gruvbox) in both light and dark modes (18 combos): ≥ 4.5:1 for body text, ≥ 3:1 for borders/large text. `neutral` is included.

#### Scenario: Every tier clears the floor in every theme/mode
- **WHEN** each of the five tiers renders in each of the 18 theme×mode combos
- **THEN** its `-fg`/`-bg` contrast SHALL be ≥ 4.5:1 body / ≥ 3:1 border (adjust the color-mix percentage for any failing combo)
