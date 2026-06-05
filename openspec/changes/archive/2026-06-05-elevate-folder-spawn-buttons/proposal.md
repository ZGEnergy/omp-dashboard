# Elevate folder spawn buttons

## Why

The `+Session` action — the primary way a user starts work in a folder — is
today a cramped `text-[10px]` pill crowded among `Worktree`, `Terminals(N)`,
`Editor`, and the Pi Resources icon inside `FolderActionBar`. The most-used
action carries the least visual weight, and on a collapsed folder the user must
first expand before they can reach a comfortable spawn affordance.

Promote spawning to two full-width, stacked line buttons in the folder header so
the primary actions are obvious and always reachable, even when the session list
is collapsed.

## What Changes

- Move `+Session` and `+Worktree` **out** of `FolderActionBar`. The action bar
  shrinks to `Terminals(N) | Editor | [native editors] | Clean up broken | 🧩`.
- Add two **full-width stacked buttons** in the folder header content column,
  below the trimmed `FolderActionBar` and above the plugin/OpenSpec sections:
  - `+ New Session` (green) on top — always rendered.
  - `+ New Worktree` (orange) below — rendered only when the existing worktree
    gating holds (`isGitRepo && gitWorktreeEnabled && handler`).
- Buttons live in the **always-visible header**, not the collapsible card zone
  (Option B): reachable regardless of collapse state.
- **Auto-expand on spawn**: clicking either button while the folder is collapsed
  first force-expands the folder, then runs the action — so the resulting
  `PlaceholderSessionCard` and new card are visible.
- Buttons render even when the folder has **0 sessions** (primary CTA for pinned
  empty folders; expand is a no-op).

## Impact

- Affected spec: `folder-action-bar`
- Affected code:
  - `packages/client/src/components/FolderActionBar.tsx` — remove `+Session` +
    `+Worktree` buttons and their props/gating.
  - `packages/client/src/components/SessionList.tsx` — render the new stacked
    buttons in the folder header; add force-expand-then-act handlers.
  - New `packages/client/src/components/FolderSpawnButtons.tsx` — small dedicated
    component for the stacked buttons (keeps `SessionList` render readable).
- No server / protocol / shared-type changes. Reuses existing `onSpawnSession`
  and worktree-dialog wiring.
