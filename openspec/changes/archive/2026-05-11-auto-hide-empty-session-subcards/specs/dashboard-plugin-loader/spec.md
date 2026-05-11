## MODIFIED Requirements

### Requirement: Plugin manifest format

A first-party plugin SHALL be a monorepo package with a `pi-dashboard-plugin` field in its `package.json` (or, alternatively, a `dashboard-plugin.json` adjacent to `package.json`). The manifest SHALL conform to the following schema:

```ts
interface PluginManifest {
  id: string;                    // kebab-case, globally unique
  displayName: string;
  priority?: number;             // default 1000; first-party uses 100
  client?: string;               // path to bundled client entry (relative to package root)
  server?: string;               // optional path to server entry
  bridge?: string;               // optional path to pi-extension entry
  configSchema?: string;         // optional path to JSON Schema for config
  claims: PluginClaim[];
}

interface PluginClaim {
  slot: SlotId;                  // must match a known slot id
  component?: string;            // exported component name from client entry (for React slots)
  command?: string;              // for "command-route" slot
  trigger?: string;              // for "anchored-popover" slot
  config?: Record<string, unknown>; // slot-specific config
  predicate?: string;            // optional name of an exported predicate function
                                 // — answers "does this claim apply to this target?"
                                 //   (filters claims at registry level)
  shouldRender?: string;         // optional name of an exported sync function
                                 // — answers "will this claim's component produce
                                 //   visible output for this target?"
                                 //   Used by useSlotHasClaimsForSession (and
                                 //   sibling helpers) to gate the wrapper subcard
                                 //   without speculative rendering.
}
```

The `predicate` and `shouldRender` fields differ in intent:

- `predicate(props): boolean` filters claims at the registry level. Use it when the claim is structurally inapplicable to a target (e.g. wrong cwd, wrong source). A claim that fails its predicate is removed from the slot's claim list entirely and never mounted.
- `shouldRender(props): boolean` runs alongside `predicate` but at the wrapper-gate layer. Use it when the claim's component conditionally returns `null` based on dynamic state (e.g. "extension not installed", "user not authenticated"). A claim whose `shouldRender` returns `false` is NOT mounted inside the slot, AND counts as absent for the purposes of `useSlotHasClaimsForSession` (so the wrapper hides).

Both functions MUST be synchronous. Plugins requiring async state SHALL maintain a sync-readable cache and return a closed-by-default value while the cache is unpopulated.

#### Scenario: Manifest read from package.json

- **WHEN** the loader scans `packages/openspec-plugin/package.json`
- **THEN** it SHALL parse the `pi-dashboard-plugin` field and treat it as the manifest.

#### Scenario: Adjacent dashboard-plugin.json takes precedence

- **WHEN** both `package.json#pi-dashboard-plugin` and `dashboard-plugin.json` exist in the same package
- **THEN** the loader SHALL use `dashboard-plugin.json` and log a warning about the duplication.

#### Scenario: Invalid manifest is rejected at load time

- **WHEN** a manifest references an unknown slot id, missing required fields, or an unparseable schema
- **THEN** the loader SHALL log a fatal validation error naming the package and the violation, mark the plugin as failed, and continue loading other plugins.

#### Scenario: Manifest with shouldRender field is accepted

- **WHEN** a manifest contains a claim with `"shouldRender": "shouldRenderHonchoMemory"`
- **AND** the named function is exported from the plugin's client entry
- **THEN** the loader SHALL resolve the string to the function reference and store it on the resolved `ClaimEntry.shouldRender`

#### Scenario: Manifest with shouldRender referencing missing export is rejected

- **WHEN** a manifest contains `"shouldRender": "nonExistent"` and no such export exists on the client entry
- **THEN** the loader SHALL log a validation error and mark the plugin as failed (same severity as missing `component` export)

## ADDED Requirements

### Requirement: `useSlotHasClaimsForSession` consults `shouldRender`

The runtime helper `useSlotHasClaimsForSession(slotId, session): boolean` (exported from `packages/dashboard-plugin-runtime/src/slot-consumers.tsx`) SHALL return `true` only when at least one claim:

1. matches `slotId`,
2. passes its optional `predicate(session)` (existing behavior), AND
3. passes its optional `shouldRender(session)` (new behavior; claims without `shouldRender` are treated as if `() => true`).

Sibling helpers for other targets (folder, command, etc.) SHALL apply the same rule when introduced.

#### Scenario: Hook returns false when only claim's shouldRender returns false
- **WHEN** a session-card-memory claim is registered with `shouldRender: () => false`
- **AND** no other session-card-memory claim exists
- **THEN** `useSlotHasClaimsForSession("session-card-memory", session)` SHALL return `false`

#### Scenario: Hook returns true when at least one claim's shouldRender returns true
- **WHEN** two session-card-memory claims exist, one with `shouldRender: () => false` and one with `shouldRender: () => true`
- **THEN** `useSlotHasClaimsForSession("session-card-memory", session)` SHALL return `true`

#### Scenario: Hook treats absent shouldRender as pass-through
- **WHEN** a claim has no `shouldRender` declared and passes its predicate
- **THEN** the claim SHALL count toward the hook's `true` result

### Requirement: Slot consumers skip claims whose `shouldRender` returns false

The slot consumer components in `slot-consumers.tsx` (`SessionCardMemorySlot`, `SessionCardBadgeSlot`, `WorkspaceActionBarSlot`, `SessionCardActionBarSlot`, etc. — all session-scoped consumers) SHALL filter the claim list with `shouldRender(session)` (when declared) before rendering. A claim whose `shouldRender` returns `false` SHALL NOT be mounted at all (no `SlotErrorBoundary`, no `CurrentPluginLayer`, no `Component`).

#### Scenario: Slot consumer mounts only claims whose shouldRender returns true
- **WHEN** a slot has two claims, one with `shouldRender: () => false` and one without `shouldRender`
- **AND** the slot consumer renders for a session
- **THEN** only the second claim's component SHALL be mounted in the rendered output

#### Scenario: Slot consumer renders nothing when all claims gated out
- **WHEN** every claim for the slot has `shouldRender: () => false`
- **THEN** the slot consumer SHALL render nothing (no fragment, no boundary)
