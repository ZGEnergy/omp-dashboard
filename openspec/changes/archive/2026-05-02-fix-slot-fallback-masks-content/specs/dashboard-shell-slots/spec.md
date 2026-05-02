## ADDED Requirements

### Requirement: Slot consumers SHALL NOT mask sibling fallbacks via JSX-`??` chains

Slot consumer components MUST NOT be placed directly as the left operand of a `??` (nullish-coalescing) operator in a JSX route fallback chain. The `??` operator evaluates the JSX **element**, which is always a truthy object, regardless of whether the consumer renders `null` once mounted. Placing `<XxxSlot/>` directly before `??` therefore makes any subsequent fallback unreachable when the slot has zero claims — the slot wrapper silently masks the sibling.

When wiring a slot consumer into a fallback chain, the JSX element MUST be gated on a registry claim count (or equivalent runtime check) **before** construction:

```tsx
// CORRECT
(claimCount > 0 ? <ContentViewSlot session={s} routeParams={p} onClose={c} /> : null)
  ?? sessionDetail
  ?? <LandingPage … />

// INCORRECT — masks sessionDetail and LandingPage when no plugin claims the slot
<ContentViewSlot session={s} routeParams={p} onClose={c} />
  ?? sessionDetail
  ?? <LandingPage … />
```

The convention is enforced by a repository-level lint test (`packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts`) that scans the dashboard shell entry points for the anti-pattern. The lint test SHALL fail with the offending file:line when the gating expression does not contain `getClaims(` or `.length [><=]` within a tight lookback window.

This requirement applies to every slot consumer exported by `@blackbelt-technology/pi-dashboard-plugin-runtime` whose contribution can render `null` when no plugins claim it (i.e. `ContentViewSlot`, `SidebarFolderSectionSlot`, `SessionCardBadgeSlot`, `SessionCardActionBarSlot`, `ContentHeaderStickySlot`, `ContentInlineFooterSlot`, `AnchoredPopoverSlot`, `CommandRouteSlot`, `SettingsSectionSlot`, `ToolRendererSlot`, and any future slot consumer).

#### Scenario: Lint fails on a `<XxxSlot/> ?? fallback` direct sequence

- **WHEN** `packages/client/src/App.tsx` contains the line `<ContentViewSlot session={s} /> ?? sessionDetail`
- **THEN** the lint test `no-jsx-slot-nullish-fallback.test.ts` SHALL fail with an error message referencing `App.tsx:<line>` and the offending snippet

#### Scenario: Lint fails on the production bug shape (ternary-wrapped, no claim gate)

- **WHEN** `App.tsx` contains the ternary-wrapped shape `(selectedId && selectedSession ? <ContentViewSlot … /> : null) ?? sessionDetail` with no claim-count check in the ternary condition
- **THEN** the lint test SHALL fail and identify the line where the JSX is constructed

#### Scenario: Lint passes when the JSX is gated on a registry claim count

- **WHEN** `App.tsx` contains `(selectedId && selectedSession && _pluginRegistry.getClaims("content-view").length > 0 ? <ContentViewSlot … /> : null) ?? sessionDetail`
- **THEN** the lint test SHALL pass — the `getClaims(` token within the lookback window proves the JSX construction is correctly gated

#### Scenario: Lint ignores sibling-mounted slot consumers

- **WHEN** `App.tsx` contains a slot consumer mounted as a sibling, e.g. `<ContentHeaderStickySlot session={s} />` followed on later lines by unrelated JSX containing `??` operators
- **THEN** the lint test SHALL NOT flag the slot — the inter-token character class between the slot's `/>` and the next `??` rejects `<`, `{`, `;`, etc. that necessarily appear when crossing into a sibling subtree

#### Scenario: Behavior test pins the fix semantics

- **WHEN** the regression test `content-view-slot-fallback.test.tsx` renders the gated expression with `claimCount = 0` and a fallback element
- **THEN** the test SHALL render only the fallback element

- **WHEN** the same test renders the gated expression with `claimCount = 1` and an active slot
- **THEN** the test SHALL render only the slot element (the fallback SHALL NOT render)
