## ADDED Requirements

### Requirement: Slot taxonomy SHALL classify each slot id by predicate input shape

The shared package `@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/slot-types.js` SHALL export a public type `SlotPredicateInput<S extends SlotId>` that maps every `SlotId` to the input shape its registered predicates receive at runtime. The mapping SHALL reflect the actual filter helpers in the plugin runtime:

| Slot category | Slot ids | `SlotPredicateInput<S>` |
|---|---|---|
| Session-scoped | `session-card-badge`, `session-card-action-bar`, `session-card-memory`, `workspace-action-bar`, `content-view`, `content-header-sticky`, `content-inline-footer`, `command-route` | `DashboardSession \| null \| undefined` |
| Folder-scoped | `sidebar-folder-section` | `FolderDescriptor` |
| Predicate-irrelevant | every other `SlotId` (`settings-section`, `tool-renderer`, `anchored-popover`, all descriptor-only slots) | `never` |

The classification SHALL be expressed as a single conditional type. The file SHALL include a compile-time exhaustiveness assertion (analogous to the existing `_AssertAllSlotsCovered` pattern for `SlotPropsMap`) that fails type-checking if any `SlotId` is left unclassified.

The `never` value for predicate-irrelevant slots is documentation-only: under the bivariant method-shorthand contract used by `ClaimEntry`, predicates can still be registered against `never`-input slots without a type error, but the registered function is never invoked at runtime because filter helpers only target session- and folder-scoped slots. Plugins SHOULD NOT rely on `never`-typed slots rejecting predicates at compile time.

#### Scenario: Session-scoped slot maps to DashboardSession input

- **WHEN** type-checking `SlotPredicateInput<"session-card-badge">`
- **THEN** the resolved type SHALL be `DashboardSession | null | undefined`.

#### Scenario: Folder-scoped slot maps to FolderDescriptor input

- **WHEN** type-checking `SlotPredicateInput<"sidebar-folder-section">`
- **THEN** the resolved type SHALL be `FolderDescriptor`.

#### Scenario: Predicate-irrelevant slot maps to `never`

- **WHEN** type-checking `SlotPredicateInput<"settings-section">`
- **THEN** the resolved type SHALL be `never`.
- **AND** registering a predicate on such a slot SHALL compile (method bivariance) but the predicate SHALL NOT be invoked at runtime.

#### Scenario: Adding a new slot id without classification is a compile error

- **WHEN** a new entry is added to the `SlotId` union but is not assigned a classification in `SlotPredicateInput`
- **THEN** the compile-time exhaustiveness assertion in `slot-types.ts` SHALL fail with a TypeScript error pointing at the unclassified slot.
