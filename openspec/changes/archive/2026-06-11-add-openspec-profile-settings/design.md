## Context

The dashboard already reads the global OpenSpec workflow config via `openspec config list --json` (server recipe `OPENSPEC_CONFIG_LIST`, proxied at `GET /api/openspec/config` with a 30s cache, consumed client-side by `useOpenSpecConfig`). Action buttons in `SessionOpenSpecActions.tsx` and `ComposerSessionActions.tsx` gate visibility on `cfg.workflows.includes(...)`. There is no write path.

Two CLI facts constrain the design (verified against openspec v1.3.1):
- `openspec config profile <preset>` only accepts **`core`** as a named preset. `expanded` and `custom` return `Unknown profile preset`.
- `openspec config set workflows '[...]'` rejects array values passed as a CLI string. The interactive picker can't be driven programmatically.

The config file itself is plain JSON (`profile`, `delivery`, `workflows`, `telemetry`, `featureFlags`) and is the true source of truth.

A second timeline matters: changing the global config updates dashboard button **visibility** instantly (dashboard reads the global config), but a button's **action** (`/skill:openspec-<verb>-change`) depends on per-project skill files in `<cwd>/.pi/skills/`, which only regenerate when `openspec update` runs in that project. So save and update are genuinely separate operations.

## Goals / Non-Goals

**Goals:**
- Let the user set `core` / `expanded` / `custom` (with a workflow multiselect) from Settings.
- Save writes only the global config — never mutates a project repo.
- Provide explicit refresh: a per-cwd Update button and an Update-all button.
- Surface per-cwd staleness so the user knows which projects lag the current profile.
- Re-render buttons immediately after save (bust server + client caches).

**Non-Goals:**
- Surfacing the `delivery` field (left at its existing value).
- Auto-running `openspec update` as a side effect of Save.
- Per-project profile overrides (profile is global by design).
- Detecting external CLI `openspec update` runs (staleness is dashboard-tracked only).

## Decisions

**D1 — Branch the write by profile: preset for `core`, atomic JSON for `expanded`/`custom`.**
`core` uses the real CLI preset (`OPENSPEC_CONFIG_PROFILE` recipe → `openspec config profile core`) so we stay aligned with CLI semantics. `expanded`/`custom` have no preset, so we write `~/.config/openspec/config.json` directly. *Alternative considered:* always write JSON (rejected — loses the CLI's canonical core behavior). *Alternative:* drive the interactive picker (rejected — not scriptable).

**D2 — Write `profile: "expanded"` for the Expanded option** (per resolved Q3), with the full expanded workflow set. The dashboard type union already allows `"expanded"`, so round-tripping is consistent.

**D3 — Atomic write via tmp-file + `rename()`** in the same directory (per resolved Q4). Rename is atomic on POSIX same-filesystem, so concurrent CLI/tool reads never see a torn file; a failed write leaves the original intact.

**D4 — Decouple Save from Update.** Save touches only the global file. `openspec update` is always explicit. This is more minimal (no cwd loop in the save handler, no mass-mutation concurrency) and avoids silently dirtying repos the user isn't working in.

**D5 — Staleness via a workflow-set signature stored per cwd in the preferences store.** On each dashboard-run update for a cwd, record `signature = stable-hash(sorted(workflows))`. `update-status` compares each cwd's stored signature to the current global signature: equal → `up-to-date`, differs → `needs-update`, absent → `unknown`. *Alternative considered:* parse generated skill files per cwd and diff against enabled workflows (rejected for v1 — fragile, depends on generator internals). Signature tracking is robust and generator-agnostic; the trade-off is that external CLI updates aren't detected, which is acceptable because `openspec update` is idempotent (`--force` exists) so a false `needs-update` is harmless.

**D6 — "Known cwds" = union of active session cwds and pinned directories**, matching the existing pattern in `OpenSpecGroupsSettingsSection` and the pi-resource-file allowlist. Update-all iterates this union (per resolved Q1, refined to explicit triggers).

**D7 — Cache invalidation on save.** Server clears the 30s `configCache` entries; client calls `__resetOpenSpecConfigCache()` then refetches. This makes button visibility reflect the new profile without a reload.

**D8 — New endpoints live in `openspec-routes.ts`** behind the existing `networkGuard` (localhost-only), consistent with the other OpenSpec/Pi-resource routes.

## Risks / Trade-offs

- **Global blast radius** → A profile change affects Claude Code / Cursor / CLI on the machine. Mitigation: prominent warning banner; Save is explicit; no project files touched.
- **Stale signature after external CLI update** → dashboard may show `needs-update` when the project is actually current. Mitigation: `openspec update` is idempotent; re-running is safe and cheap.
- **Concurrent writers to the global file** → Mitigation: atomic tmp+rename (D3). Last-writer-wins is acceptable for a single-user setting.
- **Update-all latency across many cwds** → Mitigation: per-cwd results returned independently; one failure doesn't abort the batch; UI refreshes badges from `update-status` afterward.
- **Profile/workflows drift if client sends an inconsistent pair** (e.g., `core` with extra workflows) → Mitigation: client derives `workflows` from the selected profile; for `core` the server uses the preset and ignores the supplied array.

## Migration Plan

- Purely additive: three new endpoints + one new Settings section. No schema migration, no data backfill.
- Existing read path (`GET /api/openspec/config`, `useOpenSpecConfig`) is unchanged.
- Rollback: remove the Settings section and the three endpoints; the dashboard reverts to read-only behavior. The global config file is unaffected by removal.
- Preferences-store gains a `openspecUpdateSignatures: Record<cwd, string>` map; absence is treated as `unknown`, so older preference files need no migration.

## Open Questions

- None blocking. (Q1–Q4 resolved: update-all + explicit per-cwd updates; delivery out of scope; `profile:"expanded"`; atomic write.) A future enhancement could add file-parse-based staleness to catch external CLI updates, but it is out of scope here.
