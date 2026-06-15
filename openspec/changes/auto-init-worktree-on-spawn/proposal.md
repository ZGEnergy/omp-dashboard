## Why

Creating a worktree via `POST /api/git/worktree` deliberately performs the
checkout only — running the `.pi/settings.json#worktreeInit` hook (`npm ci`,
`openspec init`, etc.) is a separate, explicitly-triggered step surfaced as the
`WorktreeInitButton` ("Initialize", shown iff `hasHook && needsInit`). This split
was introduced by `generalize-worktree-init-hook` because the hook is arbitrary
`bash -c` and must be TOFU trust-gated — auto-running untrusted shell on spawn is
a security hole.

The result: every freshly spawned worktree lands without `node_modules` or
openspec scaffolding until the user manually clicks **Initialize**. For repos the
user has already trusted, that manual step is pure friction.

This change adds an opt-in **"Initialize on worktree"** dashboard preference. When
ON, a worktree spawn auto-fires the existing init flow — but only when the hook is
already trusted. Untrusted hooks degrade to today's manual button, preserving the
TOFU guarantee.

## What Changes

- New global dashboard preference `autoInitWorktreeOnSpawn` (default `false`),
  stored in `preferences.json` via the existing preferences store, surfaced as a
  toggle in Settings.
- After a successful worktree spawn, the client checks init-status for the new
  checkout. When the preference is ON **and** the hook is trusted **and**
  `needsInit`, it auto-invokes the existing `runWorktreeInit` flow (same progress
  bus, same failure card) without user interaction.
- When the preference is ON but the hook is **untrusted**, no silent run occurs —
  the `WorktreeInitButton` appears exactly as today (first run still requires a
  manual trust grant; subsequent spawns of the same trusted hook auto-init).
- The **Initialize** button itself is unchanged — it already renders iff
  `hasHook && needsInit`. No new button work; this change only documents that
  invariant and wires the auto-trigger around it.

## Capabilities

### New Capabilities
- `worktree-auto-init`: opt-in preference that auto-runs the worktree init hook
  after spawn, gated on existing TOFU trust; degrades to the manual Initialize
  button when untrusted.

### Modified Capabilities
- `worktree-init`: documents that auto-trigger is an additional caller of the
  existing `POST /api/git/worktree/init` flow and MUST honor TOFU trust (no silent
  run of untrusted hooks).

## Impact

- **Server** (`src/server/preferences-store.ts`): add `autoInitWorktreeOnSpawn`
  boolean to the preferences schema + getter/setter. No new endpoints; the
  existing `GET/POST /api/git/worktree/init-status` + `/init` are reused.
- **Client** (`packages/client/src/`): post-spawn hook in the worktree-spawn
  success path reads the preference, probes init-status, and auto-calls
  `runWorktreeInit` when trusted+needsInit. Settings UI gains one toggle.
- **Protocol** (`packages/shared/src/`): preference key added to the preferences
  type if it is part of the shared preferences contract.

## Migration / Compatibility / Rollback

- **Migration**: none. New preference defaults `false`; absent key reads as
  `false`, so existing installs behave exactly as today.
- **Compatibility**: no endpoint or protocol breaking change. The auto-trigger is
  purely additive client behavior gated behind an off-by-default flag.
- **Rollback**: revert the client wiring + preference; the manual Initialize
  button continues to work unchanged.

## Non-Goals

- Server-side auto-run on `POST /api/git/worktree` (cannot prompt for TOFU trust;
  rejected in favor of trusted-only client auto-trigger).
- Scoping the setting to a "git plugin" — git/worktree is not extracted into a
  plugin yet (`extract-git-as-plugin` is still a proposal). This change uses a
  global dashboard preference; it can be re-homed when the git plugin lands.
