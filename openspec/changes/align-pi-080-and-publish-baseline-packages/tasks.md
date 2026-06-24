# Tasks — align-pi-080-and-publish-baseline-packages

## 1. Group A — pi dependency bump 0.78.0 → 0.80.2

- [x] 1.1 Edit `packages/server/package.json`: `@earendil-works/pi-coding-agent` `^0.78.0` → `^0.80.2`
- [x] 1.2 `npm install` → bundled copy now 0.80.2 (confirmed)
- [x] 1.3 Full `npm test` green (8215 passed, 0 failures); provider-register + reload suites pass — pi-ai dynamic import resolves
- [ ] 1.4 Manual smoke: spawn a session, confirm provider catalogue + models populate (DEFERRED — needs running dashboard; test suite covers regression risk)

## 2. Group B — recommended-extensions manifest

- [x] 2.1 `sourcesMatch()` does NOT span npm renames (npm↔npm = exact name). Manifest already on new `-extension` id; real gap was the id not being published (Group C). git↔npm cross-match keeps git-installed pi-flows satisfying the npm entry.
- [x] 2.2 Gathered descriptions/tools for all 5 from each package.json
- [x] 2.3 Updated `recommended-extensions.test.ts` (12-entry membership, npm-only, pi-flows npm) FIRST — confirmed red (6 failures)
- [x] 2.4 Added `context-mode` (`strongly-suggested`, ctx_* tools, autowired)
- [x] 2.5 Added `pi-hermes-memory` as default memory backend (`optional`, autowired)
- [x] 2.6 Reframed `pi-memory-honcho` as the server-backed alternative; kept `dashboardPlugin: "honcho"`
- [x] 2.7 Added `@ricoyudog/pi-goal-hermes`, `@blackbelt-technology/pi-model-proxy`, `pi-simplify` (`optional`)
- [x] 2.8 pi-flows `source` → `npm:@blackbelt-technology/pi-flows`; NOT in `BUNDLED_EXTENSION_IDS` (confirmed via test)
- [x] 2.9 image-fit migration (D4): manifest on new id only; documented settings-swap in CHANGELOG (sourcesMatch can't span npm rename). Old git/local installs still match via existing cross-kind logic.
- [x] 2.10 manifest (17/17) + server recommended-routes/enricher (38/38) green; fixed 2 downstream route tests (count 7→12, pi-flows git→npm enrichment)
- [x] 2.11 `npm run build` clean; full suite green (rows render via existing enrichment, no client change)

## 3. Group C — publish 4 missing packages at 0.5.4

- [x] 3.1 Bumped to `0.5.4`: kb, kb-extension, mockup-loop. Also bumped kb-extension's dep `pi-dashboard-kb` `^0.0.0`→`^0.5.4` (caret on 0.0.0 wouldn't accept 0.5.4)
- [x] 3.2 Added `publishConfig.access:"public"` to `packages/kb`
- [x] 3.3 Added real tsc build to kb (`tsconfig.json`, `build` + `prepublishOnly`); `dist/cli.js` runs with shebang preserved. Others ship source-only (existing pattern). Fixed kb `files` to exclude `src/__tests__`.
- [x] 3.4 Dry-ran all 4; inspected file lists (kb ships dist+src, no tests; others clean)
- [x] 3.5 Published all 4 at 0.5.4 with `--access public`
- [x] 3.6 `npm view` confirms all 4 at `0.5.4` on the `@blackbelt-technology` scope

## 4. Docs + close-out

- [x] 4.1 CHANGELOG `[Unreleased]` updated (Added: 5 manifest entries + 4 baseline publishes; Changed: pi 0.80.2 bump, hermes-default + honcho-alternative + image-fit migration note)
- [x] 4.2 `docs/file-index-shared.md` recommended-extensions.ts row updated via subagent (caveman style)
- [~] 4.3 CodeRabbit gate invoked; cloud rate-limited (no output) → deferred per warn-and-continue contract; no Critical/Warning surfaced
- [x] 4.4 Full verify: `npm test` 8215 passed / 0 failures; `npm run build` clean
- [x] 4.5 kb `engines.node` bumped `>=22.5.0` → `>=23.4.0` (node:sqlite unflagged → plain `node` bin shebang honest at floor); source-only, no republish

## 5. Release-prep (CI publish enablement)

- [x] 5.1 Confirm all 4 new packages + root in `publish.yml` `PACKAGES=()` allowlist; `publish-allowlist-complete` + `publish-workflow-contract` tests green (21/21)
- [x] 5.2 Confirm allowlist ordering: `pi-dashboard-kb` precedes dependent `pi-dashboard-kb-extension`; root `pi-agent-dashboard` last
- [x] 5.3 **npmjs Trusted Publisher / OIDC**: CONFIRMED set for all 4 brand-new package names (`@blackbelt-technology/pi-image-fit-extension`, `frontend-mockup-loop`, `pi-dashboard-kb`, `pi-dashboard-kb-extension`) — GitHub Actions publisher (repo + `publish.yml`) linked on npmjs.com. (Manual `0.5.4` publishes used a local token; CI `--provenance` path now has per-package OIDC.) Verified by owner via npmjs.com Settings → Trusted Publisher.
- [ ] 5.4 Next-release confirmation: on the next `publish.yml` run, `publish` skips already-live `0.5.4` (idempotent) and any future bump publishes all 4 with `--provenance` and no auth error. (Empirical; happens automatically at next release — no separate action.)

## 6. Piece A — `requires` declaration + live probe on RecommendedExtension

- [ ] 6.1 Add optional `requires?: { piExtensions?: string[]; binaries?: string[]; services?: string[] }` to `RecommendedExtension` (`packages/shared/src/recommended-extensions.ts`), mirroring `PluginRequirements` in `dashboard-plugin/manifest-types.ts`
- [ ] 6.2 Add a structured probe result to `EnrichedRecommendedExtension` (`rest-api.ts`) mirroring `plugin-status.ts` `{ piExtensions[], binaries[], services[] }` with `satisfied` flags
- [ ] 6.3 Locate + reuse the plugin requirement-probe in `packages/server/src/server.ts`; factor a shared probe helper if needed (ToolRegistry binary resolution + service probes). TDD: test the enricher returns satisfied/unsatisfied correctly
- [ ] 6.4 Wire the probe into `recommended-routes.ts::enrichEntry` (cache like the existing 30s enrichment)
- [ ] 6.5 Populate `requires` from each package's docs (confirm exact values): `pi-agent-browser` (binary `agent-browser` + Chromium), `pi-memory-honcho` (service: Honcho server), `context-mode` (sandbox runtimes — confirm which are hard vs optional). NOT hermes.
- [ ] 6.6 Render the probe in `RecommendedExtensions.tsx` (satisfied ✓ / missing ⚠ per requirement); update manifest-shape test
- [ ] 6.7 `npm test` + `npm run build` green

## 7. Piece B — offline-bundle pi-hermes-memory (bundled-but-dormant)

- [ ] 7.1 Make `pi-hermes-memory` land in `resources/server/node_modules/` at bundle time (add to the bundled server's prod deps OR a dedicated install step in `bundle-server.mjs`); confirm `better-sqlite3` resolves
- [ ] 7.2 Add a GO/NO-GO gate in `bundle-server.mjs` mirroring the node-pty gate: assert `node_modules/better-sqlite3/build/Release/better_sqlite3.node` (or prebuilds) present for the leg's platform; fail build on regression
- [ ] 7.3 Confirm per-platform: each matrix leg's `npm install --omit=dev` yields ABI-137 `better_sqlite3.node`; assert `--source-only` cross-build path does NOT claim hermes bundled (skip gate there)
- [ ] 7.4 First-run/activation: enabling hermes in the Recommended Extensions card resolves the bundled copy **offline** (no network `npm install`); wire `sourcesMatch`/installed-path detection to the bundled location
- [ ] 7.5 Keep dormant: hermes NOT auto-activated on first run; only user-enabled
- [ ] 7.6 Verify installer size delta acceptable; `npm test` + targeted electron bundle test green

## 8. Phase-A/B close-out

- [ ] 8.1 CHANGELOG `[Unreleased]`: `requires`+probe on recommended extensions; hermes offline-bundled (dormant)
- [ ] 8.2 Update `docs/file-index-shared.md` (requires field) + `docs/file-index-electron.md` (bundle-server hermes gate) via subagent, caveman style
- [ ] 8.3 Code-review gate; full `npm test` + `npm run build` green
