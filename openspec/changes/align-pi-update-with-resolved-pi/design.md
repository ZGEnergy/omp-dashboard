## Context

Two code paths independently answer "which pi?":

- **Spawn / run** — `ToolResolver.resolvePi()` → `ToolRegistry.resolveExecutor("pi")` (strategy chain: managed → bare-import → npm-global). This is the binary the dashboard actually launches for sessions.
- **Check / update** — `pi-core-checker.ts` enumerates `npm list -g` + a scan of `~/.pi-dashboard/`, classifying `installSource: "global" | "managed"`. `pi-core-updater.ts` then runs `npm install [-g] <pkg>@latest`.

These diverge whenever the resolved pi is not in the two enumerated trees (dev checkout, project dependency, `npm link`). The updater then updates a tree the dashboard does not run, reports success, and the spawned pi stays stale. This is what broke session spawning: global pi went to 0.80.2, the `pi-web-access` extension updated to a version importing `@earendil-works/pi-ai/compat`, but the dashboard kept resolving a repo-local pi 0.78.0 whose bundled pi-ai has no `/compat` export → extension load crash → "started but never connected."

pi 0.80.x now owns the hard part. Its CLI exports `detectInstallMethod()`, `getSelfUpdateCommand()`, `getSelfUpdateUnavailableInstruction()`, pins the exact checked version (`getSelfUpdatePlan`), handles the `@mariozechner → @earendil-works` scope migration and Windows quarantine, and already refuses unsupported installs with a clear instruction. `pi update` supports `--self`, `--all`, `--extensions`, `--extension <source>`.

## Goals / Non-Goals

**Goals:**
- The pi that is checked, updated, and version-reported is the same pi the dashboard spawns.
- Delegate pi/extension updates to the resolved pi's own `pi update`, not a dashboard-side npm reimplementation.
- A top-level Update-all control that appears only when updates exist; default `--all`, with `--self` / `--extensions` options.
- Surface pi's own refusal text for non-updatable installs (no false success).

**Non-Goals:**
- Changing how extensions are *resolved/loaded* by pi (single canonical agent dir; already consistent).
- Per-package minimum-pi-version tracking/warnings (separate concern; out of scope here).
- Reviving bootstrap-state machinery or version-skew banners (covered by `restore-pi-version-skew-surface`).
- Auto-updating pi without user action.

## Decisions

**D1 — Resolve once, reuse for stats + update.**
`resolveWiredPi()` returns `{ argv, pkgRoot, version, path }` from `ToolRegistry.resolveExecutor("pi")` (realpath'd → `pkgRoot` → read `package.json`). Stats and update both consume this; no second enumeration.
*Alternative considered:* keep `npm list -g` enumeration and add a `local` classification. Rejected — still a second authority that can disagree with the resolver.

**D2 — Delegate pi update to the resolved pi (`pi update --self` / `--all`).**
The updater spawns `argv[0] [...argv.slice(1)] update <flag>`. Because we invoke the resolved pi, it self-updates the exact install; pi's `detectInstallMethod()` picks npm/pnpm/bun/managed and pi refuses unsupported installs.
*Alternative considered:* dashboard-side `classifyInstall()` + npm. Rejected — re-implements logic pi already owns (version pinning, scope migration, refusal) and drifts from pi over time.

**D3 — Extensions update via `pi update --extension <source>` and `--extensions`.**
Per-row extension Update runs `pi update --extension <source>`; the Update-all "extensions only" runs `pi update --extensions`. One updater (pi) for everything pi loads, so extension+pi version skew is resolvable in one `--all` click.

**D4 — Dashboard package keeps an npm/refuse path.**
`@blackbelt-technology/pi-agent-dashboard` has no `pi update`. Reuse the existing `detectInstallLayout()` (`electron | npm-global | monorepo | unknown`) + `suggestedReinstallCommand()` to update (npm-global) or refuse-with-instruction (electron/monorepo).

**D5 — UI: header split button, render-gated on `updatableCount > 0`.**
Update-all lives in the panel header next to *Check now*. Hidden entirely when nothing is updatable (no greyed control). Primary click = `--all`; caret dropdown = "Update pi only" (`--self`) / "Update extensions only" (`--extensions`). The existing header update badge + a status dot remain the at-a-glance indicator (already shown elsewhere in the app).

**D6 — Refusal surfacing.**
When the delegated `pi update` exits non-zero with the unavailable instruction (or the dashboard-package path detects electron/monorepo), the row shows a `manual`/`Locked` state and the panel shows pi's instruction text. The primary control degrades to "Update extensions" when only the pi self-update is blocked.

**D7 — Restart after pi self-update.**
The running server resolved the *old* pi binary; after a successful pi self-update the dashboard `POST /api/restart`s (and reloads sessions) so subsequent spawns use the new pi.

## Risks / Trade-offs

- **`pi update` output format drift** → parse loosely; rely on exit code for success/failure, stream stdout/stderr verbatim to existing progress events.
- **`--all` updates every extension on one click** (longer run, more surface) → default button is `--all` (it would have prevented this incident), but `--self` stays one dropdown click away; per-row updates remain for surgical use.
- **Resolved pi differs from the pi a *spawned session* would pick after env changes** → resolution uses the same `ToolResolver` the spawn path uses; covered by reusing one helper.
- **Restart mid-update race** → restart only fires on exit 0 after the update child closes; reuses the existing fault-tolerant `/api/restart` path.

## Migration Plan

1. Add `resolveWiredPi()` + version read from `pkgRoot`.
2. Switch `pi-core-updater` pi-row path to delegate to `<resolvedPiArgv> update --self|--all`; keep dashboard-package path on npm/refuse via `detectInstallLayout`.
3. Switch extension update endpoint to `pi update --extension <source>` / `--extensions`.
4. UI: header Update-all split control (render-gated), per-row delegation, refusal banner.
5. Restart-after-pi-update wiring.
Rollback: revert the commit; no persisted state, no protocol/data migration.

## Open Questions

- Default button label/scope confirmed as `--all`; keep "Update pi only" + "Update extensions only" in the dropdown — any need for "single extension" entry in the dropdown, or is per-row enough? (Assumption: per-row is enough.)
- Should `--all` also be offered when only extensions (not pi) have updates, or should the button read "Update extensions" in that case? (Current design: button reflects what is updatable.)
