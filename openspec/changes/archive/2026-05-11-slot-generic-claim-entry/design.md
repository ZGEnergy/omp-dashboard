## Context

The plugin registry's `ClaimEntry` (in `packages/dashboard-plugin-runtime/src/slot-registry.ts`) currently types both `predicate` and `shouldRender` as `(props: unknown) => boolean`. At runtime, predicates are only ever invoked through two filter helpers in the same file:

```ts
forSession(claims, session: DashboardSession) → c.predicate(session)
forFolder(claims, folder: FolderDescriptor)   → c.predicate(folder)
```

The slot taxonomy (`packages/shared/src/dashboard-plugin/slot-types.ts`) already enumerates every slot id and ships a `SlotPropsMap` keyed by slot id. The information needed to type predicates precisely is already present in the codebase; the runtime contract just doesn't consult it.

The Vite-side plugin registry generator (`packages/dashboard-plugin-runtime/src/vite-plugin/index.ts`) emits `packages/client/src/generated/plugin-registry.tsx` with each `ClaimEntry` declared inline. Today every emitted entry has `slot: SlotId` widened away from its literal type, so even if `ClaimEntry` were generic, the generator would erase the very evidence the type system needs.

In-tree plugin sample:
- `honcho-plugin/src/client/shouldRender.ts` — `(_session: unknown) => boolean` (over-defensive; matches the unknown contract).
- `jj-plugin/src/client/predicates.ts` — `(session: DashboardSession | null | undefined) => boolean` (correctly narrow; TypeScript rejects this when the entry is typed as `(unknown) => boolean` due to parameter contravariance).

## Goals / Non-Goals

**Goals:**
- Type `ClaimEntry.predicate` and `ClaimEntry.shouldRender` against the actual input shape determined by the slot id, so a session-scoped predicate registered on a folder slot is a compile error in the generated registry.
- Keep the change **non-BREAKING for external plugins** (third-party plugin source typed against `unknown` continues to compile and run).
- Resolve the three TS2322 errors currently surfacing in `packages/client/src/generated/plugin-registry.tsx`.

**Non-Goals:**
- Refactoring filter helpers (`forSession`, `forFolder`, etc.) to be generic over slot id. Their current signatures continue to work because callers pre-filter by slot via `getClaims(slotId)`. Optional future tightening, not in scope here.
- Changing the runtime semantics of how claims are filtered or rendered. This is a pure types-only change at the public API surface.
- Migrating descriptor-only slots (`management-modal`, `footer-segment`, `toast`, …) — their predicate input is `never` because they're never filtered by predicate today.

## Decisions

### D1. Introduce `SlotPredicateInput<S>` in shared types

Add a slot-id-keyed mapped type next to `SlotPropsMap`:

```ts
// packages/shared/src/dashboard-plugin/slot-types.ts
type SessionScopedSlot =
  | "session-card-badge" | "session-card-action-bar"
  | "session-card-memory" | "workspace-action-bar"
  | "content-view" | "content-header-sticky"
  | "content-inline-footer" | "command-route";

type FolderScopedSlot = "sidebar-folder-section";

export type SlotPredicateInput<S extends SlotId> =
  S extends SessionScopedSlot ? DashboardSession | null | undefined :
  S extends FolderScopedSlot  ? FolderDescriptor :
  never;
```

**Why this lives in `slot-types.ts`:** the classification is taxonomy-level — it's a property of the slot id, same as multiplicity and payload tier. Co-locating with `SLOT_DEFINITIONS` and `SlotPropsMap` keeps the slot contract in one place. `dashboard-shell-slots` is the spec that owns this.

**Why a conditional type rather than another mapped interface like `SlotPropsMap`:** the input is uniform per category (every session-scoped slot has the same predicate input). A conditional type expresses this with one line per category; a mapped interface would repeat the same type N times.

**Alternatives considered:**
- Per-slot mapped type (`{ "session-card-badge": DashboardSession | null | undefined; ... }`): more verbose but symmetric with `SlotPropsMap`. Rejected — DRY wins; the conditional type makes "all session slots share an input" structural rather than coincidental.
- Deriving the predicate input from `SlotPropsMap` directly (e.g. `SlotPropsMap[S]["session"]`): rejected because the predicate input is *not* the same as the component's props (predicate is called with a bare `session`, components get `{ session, pluginContext }`).

### D2. Make `ClaimEntry` generic over `SlotId` with a `SlotId` default, using method-shorthand syntax for predicates

```ts
// packages/dashboard-plugin-runtime/src/slot-registry.ts
export interface ClaimEntry<S extends SlotId = SlotId> {
  pluginId: string;
  priority: number;
  slot: S;
  /* … unchanged … */
  predicate?(input: SlotPredicateInput<S>): boolean;
  shouldRender?(input: SlotPredicateInput<S>): boolean;
  Component?: React.ComponentType<any>;
}
```

**Two design levers work together:**

1. **The default `S extends SlotId = SlotId` is the iteration-side compatibility lever.** When `ClaimEntry` is used without a type argument (as in `SlotRegistry.getClaims(slotId): ClaimEntry[]`, `claims: ClaimEntry[]` parameters, external callers, etc.), `S = SlotId` so `SlotPredicateInput<S>` is the union `DashboardSession | null | undefined | FolderDescriptor`. Iteration helpers like `forSession(claims, session: DashboardSession)` invoke `c.predicate(session)` and TypeScript accepts the call because `DashboardSession` is assignable to the wider union.

2. **Method-shorthand syntax (`predicate?(input): boolean`) is the registration-side compatibility lever.** This is critical and the design's most subtle move. TypeScript's `strictFunctionTypes` enforces **strict contravariance** for function-property types (`predicate?: (input) => boolean`), but **method-shorthand declarations remain bivariant**. Without bivariance, the static-registry generator could not emit each entry as a literal-slot-id specialization, because:

   ```ts
   // STRICT (arrow-property) — rejected:
   ClaimEntry<"session-card-badge"> NOT assignable to ClaimEntry<SlotId>
   //   reason: (DashboardSession | null | undefined) => boolean
   //           is NOT assignable to
   //           (DashboardSession | null | undefined | FolderDescriptor) => boolean
   //           by contravariance
   ```

   With method shorthand, this assignment becomes legal, so `RegistryEntry.claims: ClaimEntry[]` can hold a mixed array of per-slot-specialized entries.

**Why bivariance is sound here.** Bivariance is unsound in general (it would let a folder predicate be called with a session arg). It is **sound by construction** in this registry because the call sites are pre-filtered by slot:

   - `forSession` is only invoked on the claim list for a session-scoped slot id (the slot consumer passes `getClaims("session-card-badge")`, etc.). The predicate it calls is therefore *registered* against the same session-scoped slot, so its narrow parameter type does accept the `DashboardSession` arg at runtime.
   - `forFolder` is only invoked on `getClaims("sidebar-folder-section")`. Same argument.
   - Slots whose `SlotPredicateInput<S>` is `never` are never iterated for predicate filtering at all.

   The static slot-registry topology rules out the unsoundness bivariance would otherwise expose.

**Alternatives considered:**

- **Drop the default, require explicit `S`.** Rejected — every consumer of `ClaimEntry` (filter helpers, slot consumers, registry interface, generator output before D3 lands) would need explicit type arguments. The default makes the change additive everywhere except the generator.
- **Per-entry `as unknown as ClaimEntry` casts in the generated registry.** Rejected — hides genuine type errors and defeats the goal of the change.
- **Make `RegistryEntry.claims` a union-of-specializations array (`Array<{[S in SlotId]: ClaimEntry<S>}[SlotId]>`).** Rejected — iteration over such an array would face the function-union-call problem (TypeScript can't call a union of function types unless the argument is in the *intersection* of their parameter sets), which would break every existing filter helper unless rewritten with discriminant narrowing per `c.slot`.

   Method-shorthand bivariance achieves the same goal with a single-character change to two field declarations.

### D3. Generator emits literal slot ids

`viteDashboardPluginsPlugin` (in `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts`) currently emits entries as:

```tsx
{ pluginId: "jj", priority: 100, slot: "session-card-badge", Component: …, predicate: isInJjWorkspace }
```

The string literal `"session-card-badge"` is preserved in JS but widened to `SlotId` when TypeScript checks the file because the surrounding `claims: ClaimEntry[]` annotation has no slot-id specialization. The fix is to widen the array type's element to allow per-slot specialization, e.g. emit `claims: Array<ClaimEntry<SlotId>>` and let TS infer per entry from the literal `slot:` field. In practice TS will narrow `ClaimEntry<S>` for each object literal because `slot` is the discriminant.

If implicit narrowing proves insufficient (it should be — `slot: "session-card-badge"` paired with `predicate: isInJjWorkspace` already typechecks under the proposed contract), the generator can emit an explicit annotation per entry:

```tsx
{ pluginId: "jj", … slot: "session-card-badge" as const, predicate: isInJjWorkspace }
   satisfies ClaimEntry<"session-card-badge">
```

The implementation will start with the lighter touch (rely on inference) and add `as const` / `satisfies` only if needed.

### D4. Non-BREAKING contract — variance argument

Function parameter types are **contravariant** for arrow-property declarations, and **bivariant** for method-shorthand declarations (which is what D2 selects).

Today's contract: `predicate?: (input: unknown) => boolean` (arrow-property, contravariant).
New contract: `predicate?(input: SlotPredicateInput<S>): boolean` (method-shorthand, bivariant).

For any concrete `S` and an external plugin that retained `(props: unknown) => boolean`:

- `SlotPredicateInput<S> <: unknown` always (everything is a subtype of `unknown`).
- Under bivariance, the plugin's `(props: unknown) => boolean` is trivially assignable to the new method shape — a wider parameter type is accepted in both directions for methods.

Under the strict contravariance the previous arrow-property syntax would have required, the same direction still holds: the plugin's wider `unknown` parameter satisfies the new narrower contract because contravariance permits passing a wider-typed function to a place expecting a narrower-typed one. The bivariance of method shorthand strictly enlarges the set of accepted predicate signatures; it never shrinks it.

So third-party plugin code typed against the old `unknown` contract continues to satisfy the new contract without modification. The change is type-level additive: it allows more (specifically: narrow predicate signatures from the static-registry generator) without disallowing any prior code.

### D5. In-tree plugin updates

- `packages/honcho-plugin/src/client/shouldRender.ts`: retype `shouldRenderHonchoMemory(_session: unknown)` to `(session: DashboardSession | null | undefined)`. This is purely improving DX inside the plugin — the parameter is now strongly typed for honcho's logic to use safely.
- `packages/jj-plugin/src/client/predicates.ts`: no change. Its existing signatures `(session: DashboardSession | null | undefined) => boolean` become the canonical shape.

## Risks / Trade-offs

- **Generator-output regression** → If literal-slot-id narrowing fails, the generated `plugin-registry.tsx` still won't typecheck. **Mitigation**: implementation order is (1) types in shared, (2) types in runtime registry, (3) regenerate plugin-registry locally, (4) `npm run lint`. If step 4 fails on a generator issue, the fallback is to add `as const` + `satisfies ClaimEntry<"slot-id">` to the emitter.

- **Filter helpers stay loosely typed** → `forSession(claims: ClaimEntry[], session)` accepts mixed-slot arrays today; it'll continue to. A session-scoped session passed to a folder-scoped predicate is structurally OK because the predicate accepts the union when `S = SlotId`. The strong checking happens at registration only, not at filter-call time. This is an intentional trade-off (scope: types-only contract tightening at the registration boundary).

- **External plugin authors who *intentionally* type predicates against `unknown` for portability lose nothing** but also gain nothing automatically. They can opt in by retyping to a slot-specific input. Document in the dashboard-plugin-skill (not in this change's scope).

- **`SlotPredicateInput<S>` returning `never` for descriptor-only and predicate-irrelevant slots** is documentation-only under the bivariant method-shorthand contract. TypeScript does not reject predicates on `never`-input slots (method bivariance allows any function-typed value to satisfy `(input: never) => boolean`), so registration of a stray predicate on `settings-section` or `tool-renderer` compiles silently. The registered function is dead code at runtime because filter helpers only invoke predicates on session- and folder-scoped slot lists. If future requirements need hard rejection of predicates on these slots, the contract would have to revert to arrow-property syntax and accept the registration-side contravariance cost (see D2 alternatives).

- **Slot taxonomy classification (`SessionScopedSlot` / `FolderScopedSlot`) is internal to `slot-types.ts`** and not exported. Adding a new slot id requires updating that classification — easy to miss. **Mitigation**: the existing `_AssertAllSlotsCovered` type pattern at the bottom of `slot-types.ts` covers `SlotPropsMap`; add an analogous assertion for `SlotPredicateInput` so every `SlotId` must be classified or yield `never` explicitly.

## Migration Plan

This is a types-only change with no runtime semantics shift, no data model change, no config migration, no API endpoint change.

1. Ship `SlotPredicateInput<S>` in `@blackbelt-technology/pi-dashboard-shared`.
2. Ship `ClaimEntry<S>` generic in `@blackbelt-technology/dashboard-plugin-runtime` (same release).
3. Update `viteDashboardPluginsPlugin` emitter in the same release.
4. Update `honcho-plugin` shouldRender in the same release.
5. `npm run lint` must pass — the three TS2322 errors disappear, no new errors introduced.
6. Run the full test suite (`npm test`) — should be a no-op since no runtime code changed.

**Rollback**: revert the four-file diff. External plugin code is unaffected either direction.

## Open Questions

_(none identified — design space converged in pre-proposal exploration; record any that emerge during specs / tasks creation.)_
