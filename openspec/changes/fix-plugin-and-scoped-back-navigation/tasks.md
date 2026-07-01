## 1. Table-driven route classifier (D1 + D2, behavior-preserving)

- [ ] 1.1 Add `RouteDescriptor` type (`{ pattern, depth, computeParent? }`) and a most-specific-first, first-match resolver in `packages/client/src/lib/back-target.ts`
- [ ] 1.2 Migrate every existing hardcoded branch (`/session/:id`, `/session/:id/diff`, `/folder/:cwd/settings/:page?`, `/folder/:cwd/terminals|editor`, `/folder/:cwd/openspec/*`, `/folder/:cwd/pi-resources`, `/folder/:cwd/view`, `/settings/:page?`, `/tunnel-setup`, `/pi-view`, `/pi-resource`) into static descriptors; keep `parseRouteDepthInput`/`getMobileDepth`/`computeBackTarget` public signatures unchanged
- [ ] 1.3 Verify `back-target.test.ts` + `mobile-depth.test.ts` pass unchanged (regression fence for the migration) → `npm test 2>&1 | tee /tmp/pi-test.log`
- [ ] 1.4 Add a dev-time duplicate-pattern warning when two descriptors share a pattern

## 2. Phase 1 hotfix — automations static descriptors + picker `?file=`

- [ ] 2.1 Add failing tests: `routeDepth("/folder/CWD/automations") === 1`, `routeDepth("/automation/run/:sid") === 2`, `computeBackTarget("/automation/run/S")` → the board route (`back-target.test.ts`)
- [ ] 2.2 Add static descriptors for `/folder/:encodedCwd/automations` (depth 1 → `/`) and `/automation/run/:sid` (depth 2 → board) to unblock automations back immediately; make 2.1 pass
- [ ] 2.3 Add failing test: selecting a file in `FilePicker` pushes `?file=<relPath>` and `InstructionsPage` derives selection from the query (component/integration test)
- [ ] 2.4 Change `FilePicker.onSelect` to `navigate(/folder/:cwd/settings/instructions?file=<encoded relPath>)`; derive `selectedPath` in `InstructionsPage` from `?file=` with default + unknown-file fallback; make 2.3 pass
- [ ] 2.5 Add `history-back`/`back-regression` cases: back walks `?file=` selections then to the launcher; board back → cards; run → board

## 3. Phase 2 — plugin claims declare depth (D3 + D4)

- [ ] 3.1 Add optional top-level `depth?: 1|2` and `parentPath?: string` to `ShellOverlayRouteClaim` (`packages/dashboard-plugin-runtime/src/slot-consumers.tsx`) and the shared claim type
- [ ] 3.2 Emit one `RouteDescriptor` per `shell-overlay-route` claim from the plugin registry; `parentPath` `:params` interpolated from the current match; feed descriptors into the classifier table (static ∪ plugin)
- [ ] 3.3 Add failing test: a claim without `depth` defaults to descriptor `depth: 2` + back target `/`, and `manifest-validator.ts` emits a non-fatal warning; implement to pass
- [ ] 3.4 Add registry→descriptor unit test in `dashboard-plugin-runtime` (declared depth/parentPath produces the expected descriptor + `computeParent` interpolation)

## 4. Migrate automations to declared depth + remove Phase-1 statics

- [ ] 4.1 Add `depth: 1` to the board claim and `depth: 2` + `parentPath: "/folder/:encodedCwd/automations"` to the run-monitor claim in `packages/automation-plugin/package.json`; regenerate the static plugin registry
- [ ] 4.2 Remove the Phase-1 static automation descriptors from `back-target.ts`; add a test asserting automation depth now resolves via the registry-fed table (not the static list)
- [ ] 4.3 Confirm automations board + run-monitor back still pass their scenarios end-to-end

## 5. Verify + gate

- [ ] 5.1 Full unit run green: `npm test 2>&1 | tee /tmp/pi-test.log` → `grep -nE 'FAIL|Error|✗' /tmp/pi-test.log` empty
- [ ] 5.2 Manual smoke (dev): automations board back → cards; run monitor back → board; Directory Settings Instructions file switch + browser Back walks files; deep-link `?file=` restores selection
- [ ] 5.3 Run the CodeRabbit review gate on the diff (`review-changes.ts`) and the Biome ratchet (`npm run quality:changed`); fix Critical/Warning before commit
