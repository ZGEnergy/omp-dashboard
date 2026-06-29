## Context

Three loosely-coupled alignment tasks land together (see proposal.md): pi dep bump `0.78.0→0.80.2`, recommended-extensions manifest curation, and publishing 4 missing public packages at the `0.5.4` baseline. Constraints:

- `npm publish -ws --include-workspace-root` publishes every non-private workspace at its current version; packages whose version ≠ the published baseline are silently skipped. This is *why* kb/kb-extension/mockup-loop never reached npm.
- First publish of a scoped package defaults to **restricted** access unless `publishConfig.access:"public"` or `--access public` is passed. `packages/kb` has neither.
- The recommended-extensions manifest is consumed at runtime (server enrichment via `/api/packages/recommended`) and at build time (license/bundle script reads `source`). Membership is gated by `sourcesMatch()` recognizing the install.
- Two product decisions were resolved during explore:
  1. **hermes becomes the default memory backend**; `pi-memory-honcho` demotes to a documented alternative.
  2. **migrate** image-fit from the old `@blackbelt-technology/pi-image-fit` id to the renamed `-extension` id rather than dual-list.

## Goals / Non-Goals

**Goals**
- Server depends on pi `^0.80.2`; bundled copy + lockfile refreshed; runtime verified.
- `RECOMMENDED_EXTENSIONS` reflects the team's actual default set, with hermes as the default memory backend and honcho documented as the alternative.
- image-fit migrated cleanly (old id no longer recommended; existing installs not orphaned).
- The 4 missing public packages exist on npm at `0.5.4` so the next `release-cut` bumps them in lockstep.

**Non-Goals**
- No `piCompatibility` floor change (owned by `bump-pi-compat-to-X` / `modernize-pi-version-handling` / `restore-pi-version-skew-surface`).
- No migration of the dynamic `pi-ai` import to `/compat` (runtime-aliased; `any`-typed call site).
- No publishing of private packages (session-distiller, document-converter, demo-plugin, electron).
- No new dashboard UI — manifest rows render through existing generic enrichment.
- **No Electron bundling of the added extensions.** `BUNDLED_EXTENSION_IDS` stays `[]`; nothing ships inside the installer. Recommended ≠ bundled (see D6).

## Decisions

### D1 — Bump only the explicit pin; let `*` floats ride
Only `packages/server/package.json` hard-pins (`^0.78.0`). Bump it to `^0.80.2` and `npm install` to refresh the lockfile + the bundled `node_modules/@earendil-works/pi-coding-agent` copy. Other packages use `*` and need no edit.
**Alternative considered**: pin every package to `^0.80.2` — rejected; widens the diff and fights the existing `*` convention for non-server packages.

### D6 — recommended additions (incl. hermes) are install-on-demand, NOT in the Electron delivery
The 5 added entries surface in the Recommended Extensions UI card and install at runtime via server-side `npm install` (network required). They are **not** in the Electron installer: `forge.config.ts` `extraResource` ships only bundled Node + the bundled server tree (pi/openspec/tsx as regular npm deps) + Windows git/sh — no `bundled-extensions/`. The pre-bundle mechanism (`bundle-recommended-extensions` script + `bundled-extensions/` resource) was retired in `eliminate-electron-runtime-install`, and it only ever handled git sources; all 5 additions are npm-sourced, so even the old path could not have shipped them. `BUNDLED_EXTENSION_IDS` remains `[]`.
**Alternative considered**: re-introduce offline bundling of selected npm extensions into the installer — originally deferred; **now partially adopted** for a single native-dep exception (`pi-hermes-memory`) via D8. The general rule (recommended = install-on-demand) still holds for the other additions.

### D7 — `requires` declaration + live probe on RecommendedExtension (Piece A)
Add optional `requires?: { piExtensions?; binaries?; services? }` to `RecommendedExtension`, mirroring `PluginRequirements`. Reuse the existing plugin requirement-probe (`server.ts` — ToolRegistry binary resolution + service probes) to compute a structured result on `EnrichedRecommendedExtension`; render in `RecommendedExtensions.tsx`. Populate for `context-mode`, `pi-agent-browser`, `pi-memory-honcho` (genuine system/service needs). **NOT** hermes — `better-sqlite3` is a bundled native npm dep, not a user-provided system requirement; declaring it in `requires.binaries` would mislabel an unactionable item. Exact per-entry values confirmed from each package's docs during implementation (task).
**Alternative considered**: a free-text "prerequisites" string — rejected; loses the live satisfied/unsatisfied probe the plugin schema already provides.

### D8 — offline-bundling hermes is DEFERRED (corrected understanding; Piece B not implemented)
**DEFERRED — design correction only; no implementation in this change.**

The originally-captured "server `node_modules` route" is **invalid**: `pi-hermes-memory` is a **pi extension** (pi loads it from `settings.json` `packages[]` and exposes its tools to the agent), **not** a dependency of the dashboard server. Placing it under `resources/server/node_modules/` would ship the bits but pi would never load them. So that mechanism is struck.

The real "3rd-party requirement" is the native npm dep `better-sqlite3` (ABI 137 against bundled Node v24.15.0). Making an activatable native pi extension work **offline** requires re-introducing an offline-install path that `eliminate-electron-runtime-install` deliberately removed. Two viable mechanisms, **both deferred to a future proposal**:
- **Option A — bundled-extensions dir + offline local-source activation.** Build-time (per platform leg) `npm install pi-hermes-memory` into a staging dir (yields the package + `better_sqlite3.node` for that triple); ship as `resources/bundled-extensions/pi-hermes-memory/` (re-introduces the deleted `extraResource`); on activate, register as a local source (`pi install -l <path>` / copy into pi's managed dir + `addSourceToSettings` + flush) — no network. Existing `sourcesMatch` npm↔local-path rule makes the local install satisfy the `npm:pi-hermes-memory` entry. Add a node-pty-style GO/NO-GO gate. Reverses the `bundled-extensions/` removal.
- **Option B — npm offline cache (cacache) seed.** Seed an offline cache with the hermes + better-sqlite3 tarballs so pi's normal `npm install` resolves offline. Reverses the `offline-packages.json` removal.

**Decision: not pursued in this change.** Offline bundling cannot be done without reversing part of `eliminate-electron-runtime-install`; that reversal is out of scope here and warrants its own proposal weighing A vs B, installer-size, and the per-platform native-build matrix. Until then, `pi-hermes-memory` stays **install-on-demand** (network) via the Recommended Extensions card like every other npm recommendation (D6).
**Constraint recorded for whichever option is later chosen**: better-sqlite3 uses `prebuild-install` (single-platform per `npm install`, no prebuildify multi-triple dir), so native coverage comes from the **per-platform matrix legs**, not a `--source-only` cross-build.

### D2 — pi-ai 0.80 move is a verification step, not a code change
0.80.0 moved the pi-ai root API to `@earendil-works/pi-ai/compat`; pi's extension loader aliases root→compat (strict superset), and the dashboard's only use is a dynamic `await import("@earendil-works/pi-ai")` typed `any` in `provider-register.ts`. Verify via the existing provider-register tests + a live `npm test` after the bump.
**Alternative considered**: proactively switch the import to `/compat` — rejected; unnecessary churn, and the alias may itself be removed later with a documented migration, at which point a dedicated change handles it.

### D3 — hermes as default; honcho documented alternative
Add `pi-hermes-memory` as the recommended memory backend (status `optional`, `autowired`). Keep the existing `pi-memory-honcho` entry but reframe its `fallbackDescription` to state it is an **alternative** memory backend (self-hosted Honcho), not the default. Both retain their `dashboardPlugin` pairings (`pi-memory-honcho`↔`honcho`). No plugin is removed.
**Alternative considered**: remove honcho from the manifest — rejected; the honcho-plugin + UI still ship and users may prefer it; demoting in copy is sufficient.

### D4 — image-fit migration, not dual-list
The manifest entry already uses the new id `@blackbelt-technology/pi-image-fit-extension`. The live `settings.json` still loads old `@blackbelt-technology/pi-image-fit`. Migration approach:
- Keep the manifest on the new id only (no old-id entry).
- Add cross-kind/cross-name matching so `sourcesMatch()` treats an installed old-id `@blackbelt-technology/pi-image-fit` as satisfying the new `-extension` entry (mirrors the npm↔git defensive matching already used for pi-anthropic-messages), OR document the one-line settings swap if `sourcesMatch()` can't span a rename.
- The published new package is what fresh installs get; existing installs keep working via the match (no forced reinstall).
**Alternative considered**: list both ids — rejected; pollutes the curated list and double-counts in the UI.

### D5 — Publish the 4 packages out-of-band at 0.5.4, then let release-cut take over
Bump kb/kb-extension/mockup-loop to `0.5.4`, add `publishConfig.access:"public"` to `packages/kb`, verify build/exports, then `npm publish -w <pkg> --access public` for each of the four. After they exist at `0.5.4`, the next coordinated `release-cut` bumps them with the rest of the matrix.
**Alternative considered**: wait and let `release-cut` first-publish them — rejected; `release-cut` promotes Unreleased to a *higher* version, so they'd debut at e.g. 0.5.5 with a gap below; the user explicitly wants a `0.5.4` baseline so the matrix is uniform.

## Risks / Trade-offs

- **pi 0.80 runtime regression in provider catalogue** → `npm test` (provider-register + reload suites already mock/guard pi-ai); manual session-spawn smoke after bump.
- **First scoped publish still restricted** (forgot `--access public` / `publishConfig`) → set `publishConfig.access:"public"` in each package.json AND pass `--access public` (belt + suspenders); verify with `npm view <pkg>` post-publish.
- **image-fit rename orphans existing installs** → D4 cross-match (or documented settings swap); add a CHANGELOG migration note.
- **Publishing wrong/dirty artifact** → run each package's `build`/`prepublishOnly`; `npm publish --dry-run -w <pkg>` first to inspect the file list.
- **Version drift after manual publish** → keep all four at exactly `0.5.4` (matching the matrix) so `release-cut`'s next bump is uniform.
- **CI first-publish auth gap (OIDC)** → the manual `0.5.4` publishes authenticated with a local npm token, but `publish.yml` publishes with `npm publish --provenance` via npmjs Trusted Publisher (OIDC). A brand-new package name has no Trusted Publisher binding until one is registered on npmjs (Settings → Trusted Publisher → link repo + `publish.yml`). Mitigation: register the publisher for each of the 4 new names before the next CI release; the per-package loop isolates a missing-binding failure to that one package (FAIL=1) without rolling back the others. Tracked as task 5.3/5.4.

## Migration Plan

1. Land A+B+C edits on a branch; `npm test` green; `npm run build`.
2. `npm publish --dry-run` each of the 4; inspect file lists.
3. `npm publish -w <pkg> --access public` × 4; verify `npm view`.
4. CHANGELOG `[Unreleased]`: note pi 0.80.2 bump, manifest additions, hermes-default + honcho-alternative, image-fit migration, and the 4 baselined packages.
5. **Before the next CI release**: register npmjs Trusted Publisher (OIDC) for the 4 brand-new package names (task 5.3); then `workflow_dispatch` `publish.yml` and confirm the `publish` step skips the already-live `0.5.4` for all four with no auth error (task 5.4).
6. Rollback: `npm deprecate` a mistaken publish (cannot unpublish scoped after 72h); revert manifest/version edits via git; pin server back to `^0.78.0` if the bump regresses.

## Open Questions

- Does `sourcesMatch()` already span an npm package **rename** (old name → new name), or is a small matcher addition required for D4? Resolve by reading `package-source-matching` spec + `sourcesMatch` impl during task 1 of group B.
- `pi-simplify` / `@blackbelt-technology/pi-model-proxy` / `@ricoyudog/pi-goal-hermes` exact `displayName`, `fallbackDescription`, `unlocks`, and any `dashboardPlugin` pairing — fill from each package's `package.json`/README during implementation.
