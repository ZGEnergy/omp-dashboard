# Tasks — align-pi-080-and-publish-baseline-packages

## 1. Group A — pi dependency bump 0.78.0 → 0.80.2

- [x] 1.1 Edit `packages/server/package.json`: `@earendil-works/pi-coding-agent` `^0.78.0` → `^0.80.2`
- [x] 1.2 `npm install` → bundled copy now 0.80.2 (confirmed)
- [x] 1.3 Full `npm test` green (8215 passed, 0 failures); provider-register + reload suites pass — pi-ai dynamic import resolves
- [x] 1.4 Session-spawn validated: Docker E2E `session-spawn.spec.ts` (WS round-trip, card appears) passed against the 0.80.2-built image; full build+deploy to the live instance verified healthy (production mode, 11 sessions reloaded).

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
- [x] 5.4 Carried to the release runbook: next `publish.yml` run idempotently skips the live `0.5.4` and bumps all 4 with `--provenance` (Trusted Publisher confirmed in 5.3). No action in this change — verified automatically at next release.

## 6. Piece A — `requires` declaration + live probe on RecommendedExtension

- [x] 6.1 Added `requires?: PluginRequirements` to `RecommendedExtension` (reuses the dashboard-plugin schema; type-only import)
- [x] 6.2 Added `requirements?: PluginRequirementReport` + `missingRequirements?: string[]` to `EnrichedRecommendedExtension`
- [x] 6.3 Reused the existing probe: added `runRequirementProbesFor(requires, deps)` to `dashboard-plugin-runtime/server/requirement-probes.ts` (`runRequirementProbes` now delegates); no duplicate logic
- [x] 6.4 Wired into `recommended-routes.ts::enrichEntry` (probe deps = installed lists + shared `getDefaultRegistry()`; non-fatal on probe error; rides the existing 60s route cache)
- [x] 6.5 Populated `pi-agent-browser` only: `requires.binaries:["agent-browser"]` (probeable via ToolRegistry). **NOT** honcho (its Honcho-server requirement is a `service` absent from the closed V1 probe registry — would always report unsatisfied; surfaced instead via its `honcho` companion plugin) and **NOT** context-mode (sandbox runtimes are optional; Node always present). Avoids shipping always-red requirements. Guard test asserts any declared `services` is a known probe.
- [x] 6.6 Rendered probe in `RecommendedExtensions.tsx` (green ✓ satisfied / amber ⚠ missing per requirement, `recommended-requires-<id>` testid)
- [x] 6.7 `npm test` 8218 passed (+3) / 0 failures; `npm run build` clean
- [x] 6.8 Playwright E2E `tests/e2e/recommended-requires.spec.ts`: Settings→Packages→Recommended Extensions card shows `recommended-requires-pi-agent-browser` badge containing `agent-browser`; `pi-web-access` has no requires row. Verified against the `docker/` all-in-one harness — 7/7 e2e green (required rebuilding `pi-dashboard:local` so the image carried Piece A; `test-up.sh` does `compose up` without `--build`). See project skill `run-dashboard-e2e-local-changes`.

## 7. Piece B — offline-bundle pi-hermes-memory — DEFERRED to a future proposal

Corrected understanding (design D8): hermes is a **pi extension**, not a server dependency — the "server `node_modules` route" is invalid. Offline-bundling requires reversing an offline-install path removed by `eliminate-electron-runtime-install`; out of scope here. Tasks below are the future-proposal blueprint, NOT executed in this change.

- [~] 7.1 (DEFERRED) Choose mechanism: **A** bundled-extensions dir + offline local-source activation, or **B** npm offline cache (cacache) seed
- [~] 7.2 (DEFERRED) Per-platform build-time install of `pi-hermes-memory` (yields ABI-137 `better_sqlite3.node`); node-pty-style GO/NO-GO gate
- [~] 7.3 (DEFERRED) `--source-only` cross-build cannot produce better-sqlite3 — native coverage from matrix legs only
- [~] 7.4 (DEFERRED) Offline activation via card (local-source / cache); `sourcesMatch` npm↔local-path already satisfies the `npm:pi-hermes-memory` entry
- [~] 7.5 (DEFERRED) Dormant: not auto-activated; user-enabled only
- [~] 7.6 (DEFERRED) Installer-size review; electron bundle test

## 8. Phase-A close-out (Piece A only; Piece B deferred)

- [x] 8.1 CHANGELOG `[Unreleased]` Added entry for `requires`+probe (Piece A); hermes offline-bundling deferred — no CHANGELOG entry
- [x] 8.2 `docs/file-index-shared.md` recommended-extensions.ts row updated (requires field + probe) via subagent, caveman style
- [x] 8.3 Full `npm test` 8218 passed / `npm run build` clean. (Code-review gate: CodeRabbit cloud rate-limited — advisory, deferred per warn-and-continue.)
