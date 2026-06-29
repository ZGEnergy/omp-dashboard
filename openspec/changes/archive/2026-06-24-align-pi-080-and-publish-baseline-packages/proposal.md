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
- **POPULATE** `requires` only where genuinely probeable today: `pi-agent-browser` (`binaries: ["agent-browser"]`). **NOT** hermes (its `better-sqlite3` is a bundled native npm dep, not a user-provided system requirement), **NOT** honcho (Honcho-server `service` absent from the closed V1 probe registry — surfaced via its companion plugin instead), **NOT** context-mode (sandbox runtimes are optional). Avoids shipping always-red requirements.

### E — offline-bundle pi-hermes-memory (Piece B) — DEFERRED (design correction only)
- **CORRECTED**: the captured "server `node_modules` route" is invalid — `pi-hermes-memory` is a **pi extension** (loaded from `settings.json` `packages[]`), not a server dependency; bundling it under `resources/server/node_modules/` would never be loaded by pi.
- **DEFERRED**: offline-bundling a native pi extension requires reversing an offline-install path that `eliminate-electron-runtime-install` deliberately removed. Not pursued in this change. Two future options (design D8): **A** bundled-extensions dir + offline local-source activation; **B** npm offline cache (cacache) seed. A dedicated proposal weighs A vs B, installer size, and the per-platform native-build matrix.
- **INTERIM**: `pi-hermes-memory` stays install-on-demand (network) via the Recommended Extensions card, like every other npm recommendation.

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
- **Electron delivery**: ALL recommended additions — including `pi-hermes-memory` — install **on-demand at runtime** via the Recommended Extensions card (server-side `npm install`, network required). No extension is bundled in the installer; `BUNDLED_EXTENSION_IDS` stays `[]`. Offline-bundling hermes is deferred (Phase E / design D8). No `forge.config.ts` / installer-size change in this change.
- **Cross-refs**: `modernize-pi-version-handling`, `restore-pi-version-skew-surface`, `bump-pi-compat-to-X` series (piCompatibility floor — intentionally untouched here); `eliminate-electron-runtime-install` (removed offline-install paths; reversing one is the prerequisite for the deferred Phase E — future proposal).
