## Why

The dashboard bundles `@earendil-works/pi-coding-agent@0.78.0` while npm latest is `0.80.2` (10 patches of 0.79.x + the 0.80.0 pi-ai entrypoint move). Three loose ends compound:

1. **Stale pi dependency.** `packages/server/package.json` pins `^0.78.0`; the bundled copy and lockfile lag two minors. The dashboard misses post-compaction token estimates, compaction `reason`/`willRetry` metadata, and new exported extension helpers, and ships against an older pi-ai surface.
2. **Recommended-extensions drift.** The curated manifest (`packages/shared/src/recommended-extensions.ts`) lists 7 entries, but the team's actual `settings.json` `packages[]` runs 5 extensions absent from the manifest (`context-mode`, `pi-hermes-memory`, `pi-simplify`, `@ricoyudog/pi-goal-hermes`, `@blackbelt-technology/pi-model-proxy`) and 2 manifest entries have stale `source` (image-fit renamed; pi-flows points at the license-blocked git URL while an npm package exists).
3. **Four public packages never reached npm.** `npm publish -ws` skips them because their local version ≠ the `0.5.4` baseline (kb, kb-extension, mockup-loop) or they were renamed (image-fit-extension). `@blackbelt-technology/pi-dashboard-kb` also lacks `publishConfig.access: "public"`, so its first scoped publish would default to restricted. Until they exist on npm at a baseline, the next coordinated `release-cut` cannot bump them in lockstep with the rest.

Doing all three together keeps the pi surface, the recommended set, and the published package matrix internally consistent in one landing.

## What Changes

### A — pi dependency bump 0.78.0 → 0.80.2
- **MODIFY** `packages/server/package.json` dep `@earendil-works/pi-coding-agent`: `^0.78.0` → `^0.80.2`.
- **MODIFY** lockfile + bundled copy via reinstall.
- **VERIFY** the dynamic `await import("@earendil-works/pi-ai")` in `packages/extension/src/provider-register.ts` still resolves (0.80.0 moved the pi-ai root API to `@earendil-works/pi-ai/compat`; pi's extension loader aliases root→compat, and the call site is `any`-typed, so this is a verification step, not a code change).
- **OUT OF SCOPE**: bumping `packages/server/package.json::piCompatibility` floor — owned by the separate `bump-pi-compat-to-X` series and the `restore-pi-version-skew-surface` / `modernize-pi-version-handling` proposals. Cross-referenced, not modified here.

### B — recommended-extensions manifest
- **MODIFY** `RECOMMENDED_EXTENSIONS` in `packages/shared/src/recommended-extensions.ts`:
  - **ADD** `context-mode` (status `strongly-suggested` — backs the entire `ctx_*` workflow the team runs).
  - **ADD** `pi-hermes-memory`, `@ricoyudog/pi-goal-hermes`, `@blackbelt-technology/pi-model-proxy`, `pi-simplify` (status `optional`; confirm each `displayName`/`fallbackDescription` and any `dashboardPlugin` pairing during design).
  - **FIX** image-fit `source` so the manifest entry matches the renamed published package (`@blackbelt-technology/pi-image-fit-extension`); reconcile with the old `@blackbelt-technology/pi-image-fit` id still in live settings.
  - **FIX** pi-flows `source` to the npm spec `npm:@blackbelt-technology/pi-flows` (still excluded from `BUNDLED_EXTENSION_IDS` until upstream declares an SPDX license).
- **MODIFY** the manifest-shape test(s) that assert entry count / required fields.

### C — publish the 4 missing packages at 0.5.4
- **MODIFY** versions to `0.5.4`: `packages/kb`, `packages/kb-extension`, `packages/mockup-loop` (image-fit-extension already `0.5.4`).
- **ADD** `"publishConfig": { "access": "public" }` to `packages/kb/package.json` (missing; blocks first scoped publish).
- **VERIFY** each of the four has valid `files`/`exports`/`build` (or `prepublishOnly`) so the publish artifact is correct.
- **PUBLISH** the four explicitly at `0.5.4` (`npm publish -w <pkg> --access public`) so the next `release-cut` finds them existing and bumps them in lockstep.
- **OUT OF SCOPE**: private packages (`session-distiller`, `document-converter`, `demo-plugin`, `electron`) stay unpublished.

### D — recommended-extension `requires` declaration + live probe (Piece A)
- **ADD** optional `requires?: { piExtensions?: string[]; binaries?: string[]; services?: string[] }` to `RecommendedExtension` (`packages/shared/src/recommended-extensions.ts`), mirroring `PluginRequirements` (`dashboard-plugin/manifest-types.ts`).
- **ENRICH** `EnrichedRecommendedExtension` with a structured probe result, reusing the existing plugin requirement-probe in `server.ts` (ToolRegistry binary resolution + service probes); surface in `RecommendedExtensions.tsx`.
- **POPULATE** `requires` for the entries with genuine system/service needs: `context-mode`, `pi-agent-browser`, `pi-memory-honcho`. **NOT** hermes — its `better-sqlite3` is a native npm dep, not a user-provided system requirement (Piece B handles that).

### E — offline-bundle pi-hermes-memory + native dep into Electron (Piece B)
- **BUNDLE** `pi-hermes-memory` (and its native `better-sqlite3@^12.9.0`, ABI 137) into `resources/server/node_modules/` via the per-platform Electron build matrix (each leg's `npm install --omit=dev` produces the correct-ABI `better_sqlite3.node`). Works on the matrix legs only, **not** the `--source-only` cross-build.
- **ADD** a GO/NO-GO gate in `bundle-server.mjs` mirroring the node-pty gate: assert `better_sqlite3.node` present for the leg's platform; fail the build on regression.
- **ACTIVATION = bundled-but-dormant**: bits ship on disk; the extension activates only when the user enables it in the Recommended Extensions card, which then resolves offline (no network install). Stays opt-in; not auto-activated.
- **RECONCILES** the `eliminate-electron-runtime-install` "no bundled extensions" stance: hermes is a deliberate, single, native-dep exception — the general recommended additions remain install-on-demand (unchanged; see design D6).
- **OUT OF SCOPE (Piece B)**: bundling the other npm-recommended extensions; the `--source-only` cross-build producing better-sqlite3; manual multi-triple prebuild assembly (Option B, rejected).

## Capabilities

### New Capabilities
<!-- none — this change touches dependencies, a curated manifest, and the publish matrix; no new product capability with its own spec. -->

### Modified Capabilities
- `recommended-extensions`: the curated manifest's membership and entry `source` values change (additions + 2 drift fixes). If `openspec/specs/` has no existing spec for this surface, capture the manifest contract (membership criteria, required fields, bundled-vs-recommended distinction) as a delta during the specs phase; otherwise leave empty if the manifest is treated as implementation detail.

## Impact

- **Dependencies**: `@earendil-works/pi-coding-agent` 0.78.0→0.80.2 (server pkg + root lockfile + bundled copy). Indirect pi-ai surface shift (runtime-aliased, low risk).
- **Code**: `packages/shared/src/recommended-extensions.ts` (+ shape tests); version/`publishConfig` edits in `packages/kb`, `packages/kb-extension`, `packages/mockup-loop`.
- **Publish matrix / npm**: 4 new public packages appear on the `@blackbelt-technology` scope at `0.5.4`; subsequent `release-cut` runs include them.
- **UI**: `RecommendedExtensions.tsx` renders the new manifest rows (server enrichment already generic — no client change expected).
- **Electron delivery**: the recommended additions install **on-demand at runtime** via the Recommended Extensions card (server-side `npm install`, network required) — with **one exception**: `pi-hermes-memory` is bundled offline (Phase E). The legacy `bundled-extensions/`/`BUNDLED_EXTENSION_IDS` git-source pre-bundle path stays retired and empty; Phase E bundles hermes through the **server `node_modules`** route (per-platform matrix), not that path.
- **Native module / ABI**: `better-sqlite3` ABI 137 (bundled Node v24.15.0) ships per platform from the matrix legs; new GO/NO-GO gate in `bundle-server.mjs`. Each platform installer carries its own `better_sqlite3.node`.
- **Cross-refs**: `modernize-pi-version-handling`, `restore-pi-version-skew-surface`, `bump-pi-compat-to-X` series (piCompatibility floor — intentionally untouched here); `eliminate-electron-runtime-install` (retired the git pre-bundle path; Phase E uses the server-`node_modules` route instead, node-pty precedent).
