## ADDED Requirements

### Requirement: `ClaimEntry` is generic over `SlotId` with strong predicate input typing

The plugin runtime's `ClaimEntry` interface (in `packages/dashboard-plugin-runtime/src/slot-registry.ts`) SHALL be parameterised by slot id, with `predicate` and `shouldRender` declared using **method-shorthand syntax** so their parameter types are bivariant under TypeScript's `strictFunctionTypes`:

```ts
export interface ClaimEntry<S extends SlotId = SlotId> {
  pluginId: string;
  priority: number;
  slot: S;
  predicate?(input: SlotPredicateInput<S>): boolean;
  shouldRender?(input: SlotPredicateInput<S>): boolean;
  // … remaining fields unchanged
}
```

The method-shorthand syntax SHALL be used (rather than arrow-property syntax `predicate?: (input) => boolean`) because the static-registry generator emits each entry as a `ClaimEntry<"literal-slot-id">` specialization that must be assignable back into a mixed-slot `ClaimEntry[]` array. With arrow-property syntax, parameter contravariance forbids the narrow-to-wide direction. Method shorthand is TypeScript's documented bivariance escape hatch and is sound here because the registry's filter helpers pre-filter claims by slot id before invoking any predicate.

The default type argument `S extends SlotId = SlotId` SHALL be preserved so that existing untyped usages — including `SlotRegistry.getClaims(slotId): ClaimEntry[]`, every filter helper signature, and external `ClaimEntry[]` consumers — continue to compile without source changes.

The change SHALL be non-breaking for external plugins:

- A plugin's predicate previously typed as `(input: unknown) => boolean` SHALL remain assignable to the new method-shape contract for every concrete `S`, by parameter bivariance.
- A plugin's predicate typed narrowly (e.g. `(session: DashboardSession | null | undefined) => boolean`) SHALL be accepted at registration when the entry's `slot` is a session-scoped slot id, and SHALL be rejected by the type-checker when the `slot` is folder-scoped (mismatched concrete input types).
- Predicate registration on a slot whose `SlotPredicateInput<S>` is `never` (e.g. `settings-section`, `tool-renderer`, descriptor-only slots) SHALL compile because of method-shorthand bivariance, but the registered predicate is dead code: filter helpers only invoke predicates on session- and folder-scoped slots.

#### Scenario: Registering a session-shaped predicate on a session slot type-checks

- **WHEN** a registry entry declares `{ slot: "session-card-badge", predicate: (s: DashboardSession | null | undefined) => boolean(s) }`
- **THEN** TypeScript SHALL accept the entry without diagnostics.

#### Scenario: Registering a session-shaped predicate on a folder slot is a compile error

- **WHEN** a registry entry declares `{ slot: "sidebar-folder-section", predicate: (s: DashboardSession | null | undefined) => boolean(s) }`
- **THEN** TypeScript SHALL report a type error indicating the predicate's parameter type is incompatible with `SlotPredicateInput<"sidebar-folder-section">` (which is `FolderDescriptor`).

#### Scenario: Registering a folder-shaped predicate on a session slot is a compile error

- **WHEN** a registry entry declares `{ slot: "session-card-badge", predicate: (f: FolderDescriptor) => boolean(f) }`
- **THEN** TypeScript SHALL report a type error indicating the predicate's parameter type is incompatible with `SlotPredicateInput<"session-card-badge">`.

#### Scenario: Registering an `unknown`-typed predicate on any slot type-checks

- **WHEN** a registry entry declares `{ slot: "session-card-badge", predicate: (p: unknown) => boolean(p) }`
- **THEN** TypeScript SHALL accept the entry without diagnostics (contravariance: `unknown` is wider than the required input type).

#### Scenario: Default-generic `ClaimEntry[]` consumers compile unchanged

- **WHEN** `SlotRegistry.getClaims(slotId)` returns `ClaimEntry[]` (no explicit type argument)
- **AND** `forSession(claims: ClaimEntry[], session: DashboardSession)` invokes `c.predicate(session)`
- **THEN** the call SHALL type-check because `DashboardSession` is assignable to `SlotPredicateInput<SlotId>` (which resolves to `DashboardSession | null | undefined | FolderDescriptor`).

### Requirement: Vite plugin emits literal slot ids in the generated registry

The static-registry generator in `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts` SHALL emit each claim entry in `packages/client/src/generated/plugin-registry.tsx` so that the `slot:` field is a literal type (not widened to `SlotId`). This SHALL allow TypeScript to specialise `ClaimEntry<S>` per entry and type-check the entry's `predicate` and `shouldRender` against the correct `SlotPredicateInput<S>`.

Acceptable implementation strategies SHALL be either (a) relying on TypeScript's natural literal narrowing of the discriminant `slot:` field in object literals, or (b) emitting an explicit `satisfies ClaimEntry<"literal-slot-id">` per entry.

#### Scenario: Generated entry with session-shaped predicate on session slot compiles

- **WHEN** the generator emits an entry `{ pluginId: "jj", … slot: "session-card-badge", predicate: isInJjWorkspace }` and `isInJjWorkspace` has signature `(s: DashboardSession | null | undefined) => boolean`
- **THEN** TypeScript SHALL accept the generated file without diagnostics.

#### Scenario: Generated entry with mis-shaped predicate is a build error

- **WHEN** a plugin manifest registers a predicate whose runtime signature is incompatible with the slot's `SlotPredicateInput<S>`
- **THEN** TypeScript SHALL emit a type error during `npm run lint` (or any project type-check) naming the offending generated entry.

### Requirement: Honcho plugin retypes `shouldRenderHonchoMemory` to the session-scoped input

The in-tree `honcho-plugin` package SHALL retype `shouldRenderHonchoMemory` from `(_session: unknown) => boolean` to `(session: DashboardSession | null | undefined) => boolean`. The function body and runtime semantics SHALL be unchanged. This narrowing demonstrates the new contract on a session-scoped slot (`session-card-memory`) and surfaces stronger types for the plugin's own code.

#### Scenario: Honcho shouldRender accepts a DashboardSession

- **WHEN** the slot consumer for `session-card-memory` invokes `shouldRenderHonchoMemory(session)` with `session: DashboardSession`
- **THEN** the call SHALL type-check and run identically to today.

#### Scenario: Honcho shouldRender registered for folder-scoped slot would be a compile error

- **WHEN** a hypothetical entry registers `shouldRenderHonchoMemory` (which now takes `DashboardSession | null | undefined`) for a folder-scoped slot
- **THEN** TypeScript SHALL reject the registration because the predicate's parameter type is incompatible with `SlotPredicateInput<"sidebar-folder-section">` (`FolderDescriptor`).
