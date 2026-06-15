## Context

`generalize-worktree-init-hook` deliberately split worktree init out of worktree
creation. `POST /api/git/worktree` does the checkout only; the init hook runs via a
separate, explicitly-triggered `POST /api/git/worktree/init`, surfaced as
`WorktreeInitButton` (renders iff `hasHook && needsInit`). The split exists because
the hook is arbitrary `bash -c`, gated by TOFU trust
(`worktree-init-trust.json`, keyed by `repoRoot + sha256(hook)`).

The user wants a setting to auto-initialize on spawn plus an Initialize button. The
button already exists, so the only new work is the opt-in auto-trigger.

## Goals / Non-Goals

**Goals**
- Opt-in preference that removes the manual click for already-trusted repos.
- Preserve the TOFU security guarantee exactly.

**Non-Goals**
- Server-side auto-run on spawn (cannot prompt for trust).
- Plugin-scoped setting (git is not a plugin yet).

## Decisions

### Decision: Global preference, not plugin config
git/worktree is not extracted into a plugin (`extract-git-as-plugin` is still a
proposal). Use `preferences-store.ts` (`autoInitWorktreeOnSpawn`, default `false`).
Re-home under `plugins.git.*` if/when the git plugin lands.

- **Alternatives**: `plugins.git.*` via `plugin-config-routes` (premature — no git
  plugin); block on `extract-git-as-plugin` (couples to bigger refactor). Both
  rejected for shipping now.

### Decision: Client-side auto-trigger, trusted-only
The auto-trigger lives in the client's worktree-spawn success path and reuses the
existing `fetchWorktreeInitStatus` + `runWorktreeInit` + progress bus. It fires
only when init-status reports `trusted: true && needsInit: true`.

- **Why trusted-only**: auto-run cannot present a TOFU confirm dialog (no user
  interaction at spawn time). Running untrusted shell silently would reopen the
  exact security hole the split closed. First spawn of a new repo therefore always
  degrades to the manual button; once trusted, subsequent spawns auto-init.
- **Why client, not server**: the trust-confirm dialog is a client concern; the
  client already owns the progress UI and failure card. Server stays unchanged.

```
spawn done ──▶ pref ON? ──no──▶ (manual button as today)
                  │yes
                  ▼
           init-status probe
                  │
        ┌─────────┼──────────────┐
   needsInit=false  trusted=false   trusted=true & needsInit=true
        │              │                     │
       no-op    manual button only      auto runWorktreeInit
```

## Risks / Open Questions

- **Race**: spawn → bridge-connect → init-status probe timing. Probe must target
  the new checkout cwd only after the worktree exists on disk; the spawn success
  callback already implies the checkout completed.
- **Open**: which Settings section hosts the toggle (general vs a worktree
  subsection) — defer to existing Settings IA.
