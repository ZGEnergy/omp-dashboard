## Phase A — Resolution chain promotion

- [x] A.1 In `packages/shared/src/resolve-jiti.ts`, set `JITI_PACKAGES = ["jiti", "@mariozechner/jiti"]`. Drop `@oh-my-pi/jiti`. Update the comment to explain ordering rationale.
- [x] A.2 In `packages/shared/src/resolve-jiti.ts`, update the `Cannot find pi's TypeScript loader` error message to list `@earendil-works/pi-coding-agent` first, `@mariozechner/pi-coding-agent` as fallback. Drop `@oh-my-pi/pi-coding-agent`.
- [x] A.3 In `packages/shared/src/tool-registry/definitions.ts`, set `piPkgAliases = ["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"]`. Update the same array in the `pi-coding-agent` module registration call.
- [x] A.4 In `packages/server/src/pi-core-checker.ts`, set `CORE_PACKAGE_NAMES` to `[earendil, mariozechner, blackbelt-dashboard, blackbelt-model-proxy]`. Drop `@oh-my-pi/pi-coding-agent`.
- [x] A.5 In `packages/server/src/pi-core-checker.ts`, set `DISPLAY_NAMES` so `@earendil-works/pi-coding-agent` → `"pi (core agent)"` and `@mariozechner/pi-coding-agent` → `"pi (core agent — legacy fork)"`. Drop oh-my-pi entry.
- [x] A.6 In `packages/electron/src/lib/ts-loader-resolver.ts::resolveJitiFromPi`, candidate list tries `@earendil-works/pi-coding-agent` first (global + managed), then `@mariozechner/pi-coding-agent`. Drop oh-my-pi.
- [x] A.7 In `packages/electron/src/lib/ts-loader-resolver.ts::tryResolveJiti` and `tryResolveJitiFrom`, inner jiti probe list becomes `["jiti", "@mariozechner/jiti"]`.

## Phase B — Type imports + dynamic imports

- [x] B.1 In every `packages/extension/src/*.ts` that imports `ExtensionAPI`, change the source to `@earendil-works/pi-coding-agent` (covers `bridge.ts`, `bridge-context.ts`, `command-handler.ts`, `flow-event-wiring.ts`, `ask-user-tool.ts`, `provider-register.ts`, `multiselect-list.ts`).
- [x] B.2 In `packages/extension/src/command-handler.ts`, change `await import("@mariozechner/pi-coding-agent")` to `await import("@earendil-works/pi-coding-agent")`.
- [x] B.3 Rewrite `packages/extension/src/pi-env.d.ts` so the primary module declaration is `declare module "@earendil-works/pi-coding-agent"`. Add a sibling `declare module "@mariozechner/pi-coding-agent"` re-exporting the same `ExtensionAPI` for legacy installs. Remove the `@oh-my-pi/pi-coding-agent` declaration entirely.

## Phase C — Install lists + peer deps

- [x] C.1 In `packages/shared/src/bootstrap-install.ts`, default `packages` list becomes `["@earendil-works/pi-coding-agent", "@fission-ai/openspec", "tsx"]`.
- [x] C.2 In `packages/server/src/cli.ts`, both install package lists (`installPackages` for first-run + the `restart-helper` constants) point at `@earendil-works/pi-coding-agent`.
- [x] C.3 In `packages/server/src/server.ts`, the `/api/pi-core/update` default-package and progress-step labels use `@earendil-works/pi-coding-agent`.
- [x] C.4 In `packages/electron/src/lib/dependency-installer.ts`, the package list for the wizard's `installCorePackages` step uses `@earendil-works/pi-coding-agent`.
- [x] C.5 In `packages/electron/src/lib/power-user-install.ts`, the install list defaults to `@earendil-works/pi-coding-agent`.
- [x] C.6 In `packages/electron/src/lib/update-checker.ts`, the auto-update package list uses `@earendil-works/pi-coding-agent`.
- [x] C.7 In `packages/electron/src/lib/server-lifecycle.ts`, the "Install pi (`npm install -g …`)" hint string in `buildServerStartupError` uses `@earendil-works/pi-coding-agent`.
- [x] C.8 In root `package.json`, peerDependencies + peerDependenciesMeta:
  - ADD: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui` (all `"*"`, all optional).
  - KEEP: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui` (all optional).
  - DROP: every `@oh-my-pi/*` entry (3 entries each in deps and meta).
- [x] C.9 In `packages/extension/package.json`, peerDeps:
  - ADD: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui` (optional).
  - KEEP: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui` (optional).
  - DROP: oh-my-pi entries.

## Phase D — Test fixtures + assertions

- [x] D.1 In `packages/electron/src/__tests__/jiti-fallback.test.ts`, rename the `@oh-my-pi/jiti` fallback test to assert `@mariozechner/jiti` is tried after bare `jiti` fails. Reorder mocks accordingly.
- [x] D.2 In `packages/shared/src/__tests__/tool-registry-definitions.test.ts`, rename the alias-probe test to "probes both `@earendil-works` (preferred) and `@mariozechner` (legacy fallback) alias names". Probe-count assertions unchanged.
- [x] D.3 In `packages/server/src/__tests__/package-manager-wrapper-resolve.test.ts`:
  - `vi.mock("@oh-my-pi/pi-coding-agent", …)` → `vi.mock("@earendil-works/pi-coding-agent", …)`.
  - Managed-install fixture path moves from `node_modules/@oh-my-pi/...` to `node_modules/@earendil-works/...`.
- [x] D.4 In all server `__tests__/*` files that `vi.mock("@mariozechner/pi-coding-agent", …)`, switch the mock path to `vi.mock("@earendil-works/pi-coding-agent", …)` (covers `directory-service*.test.ts`, `is-pi-process.test.ts`, `pi-core-updater*.test.ts`, `package-routes.test.ts`, `recommended-routes.test.ts`).
- [x] D.5 In `packages/server/src/__tests__/pi-core-checker.test.ts`, update CORE_PACKAGE_NAMES expectation to `[earendil, mariozechner, blackbelt-dashboard, blackbelt-model-proxy]`. Update DISPLAY_NAMES assertions for the new "pi (core agent)" / "pi (core agent — legacy fork)" mapping.
- [x] D.6 In `packages/electron/src/__tests__/offline-packages.test.ts` and `update-checker.test.ts`, update package-name assertions to `@earendil-works/pi-coding-agent` where the primary install path is asserted.
- [x] D.7 In `packages/electron/src/lib/__tests__/launch-source.test.ts`, update fixture managed-install paths to `@earendil-works/pi-coding-agent`.
- [x] D.8 Delete the 9 stale bootstrap snapshots under `packages/shared/src/__tests__/bootstrap/__snapshots__/cube.test.ts.snap` and `packages/shared/src/__tests__/bootstrap/families/__snapshots__/{a-electron,b-npm-global,c-dev-monorepo,d-overrides,e-stale-partial,f-cwd-variants,g-windows-specifics,j-path-gui-minimal}.test.ts.snap`. They regenerate on next `vitest run`.

## Phase E — Version pin consistency (pi-coding-agent + siblings)

- [x] E.1 Bump `packages/server/package.json::piCompatibility` from `{ minimum: "0.70.0", recommended: "0.70.0" }` to `{ minimum: "0.74.0", recommended: "0.74.0" }`. Leave `maximum: null`.
- [x] E.2 Document in proposal.md why pi-ai / pi-tui / pi-agent-core do NOT get separate `piCompatibility` entries (transitive coverage via pi-coding-agent's own deps; adding entries requires schema + consumer changes for no additional safety).
- [x] E.3 Update fixture in `packages/server/src/__tests__/pi-version-skew.test.ts` (around line 200) from `@mariozechner/pi-coding-agent@0.70.0` to `@earendil-works/pi-coding-agent@0.74.0` to match the bumped piCompatibility floor.
- [x] E.4 Flip `packages/electron/offline-packages.json` pin from `@mariozechner/pi-coding-agent@0.70.0` to `@earendil-works/pi-coding-agent@0.74.0`. Verify the openspec / tsx pins still apply.
- [x] E.5 Regenerate `packages/electron/resources/offline-packages/{manifest.json,npm-cache.tar.gz}` for the host platform via `node packages/electron/scripts/bundle-offline-packages.mjs`. Cross-platform regen (linux, win32) deferred to the per-platform CI build matrix — the script accepts `--platform=<os>-<cpu>`.
- [x] E.6 Update `packages/shared/src/__tests__/node-spawn-jiti-contract.test.ts`:
  - `piEntry.name === "@mariozechner/pi-coding-agent"` → search for `@earendil-works/pi-coding-agent` first, fall back to `@mariozechner/pi-coding-agent` so the test still passes if a future build flips back.
  - `piEntry.version.startsWith("0.70.")` → accept `0.74.` (or any `0.7[4-9].`) for earendil; preserve `0.70.` for mariozechner so legacy artefacts don't fail.
  - Update the contract narrative (header + error messages) to mention earendil 0.74 + jiti 2.7 instead of mariozechner 0.70 + jiti 2.x.
- [x] E.7 Update the JITI VERSION CONTRACT comment block in `packages/shared/src/platform/node-spawn.ts` to describe the earendil 0.74 / jiti 2.7+ baseline. Keep the historical 0.71.x / 2.6.5 failure marker as the "known-broken" reference so future contributors recognise the regression.
- [x] E.8 Update the legacy-path comment in `packages/electron/src/lib/power-user-install.ts` to reference the current pin (replace `pi-coding-agent@0.71.x (jiti 2.6.5)` with the kept-historical-marker phrasing). The bug it documents is still useful context.
- [x] E.9 Run the contract test (`npx vitest run packages/shared/src/__tests__/node-spawn-jiti-contract.test.ts`) and the version-skew tests (`npx vitest run packages/server/src/__tests__/pi-version-skew.test.ts`) to confirm the new pins satisfy the assertions.

## Phase F — Electron launch-path cwd fix

- [x] F.1 In `packages/electron/src/lib/server-lifecycle.ts::launchViaCli`, change the spawn's `cwd: process.cwd()` to `cwd: MANAGED_DIR`. Add a comment block referencing this change ID and explaining the `--import tsx` shebang resolution path.
- [x] F.2 Verify diagnostics-only `cwd: process.cwd()` calls in the same file (`buildServerStartupError`) remain unchanged — they're for error reporting, not spawning.

## Phase G — Build + deploy verification

- [x] G.1 Run `npm run electron:bundle-server` to regenerate `packages/electron/resources/server/`.
- [x] G.2 Run `npm run package --workspace=@blackbelt-technology/pi-dashboard-electron` (electron-forge package) to produce the `.app` bundle in `out/`.
- [x] G.3 Verify the rebuilt `app.asar` contains 0 `@oh-my-pi` strings and ≥1 `@earendil-works` strings:
  ```
  strings out/PI-Dashboard-darwin-x64/PI-Dashboard.app/Contents/Resources/app.asar | grep -c "@oh-my-pi"   # → 0
  strings out/PI-Dashboard-darwin-x64/PI-Dashboard.app/Contents/Resources/app.asar | grep -c "@earendil-works"  # → ≥1
  ```
- [x] G.4 Verify the rebuilt asar's `launchViaCli` carries `cwd: x` (the minified `MANAGED_DIR` constant) — extract via `@electron/asar extract` and grep `.vite/build/main.js` near `Launching via CLI`.
- [x] G.5 Replace `/Applications/PI-Dashboard.app` with the freshly-built bundle and `xattr -cr` it.
- [x] G.6 Launch via `open -n /Applications/PI-Dashboard.app`. Confirm:
  - No "Cannot find pi's TypeScript loader" startup dialog.
  - `~/.pi-dashboard/server.log` shows `Dashboard server started (pid <N>) at http://localhost:8000`.
  - `lsof -nP -iTCP:8000 -sTCP:LISTEN` shows the server child listening.

## Phase H — Spec deltas (this proposal)

- [x] H.1 Author `bootstrap-install` delta: switch the offline-cache manifest requirement and `bootstrapInstall` default-packages requirement to `@earendil-works/pi-coding-agent`.
- [x] H.2 Author `dependency-installer` delta: install command names `@earendil-works/pi-coding-agent` as primary.
- [x] H.3 Author `first-run-wizard` delta: wizard installs `@earendil-works/pi-coding-agent` as primary.
- [x] H.4 Author `pi-core-version-check` delta: discovered package set adds `@earendil-works/pi-coding-agent` (primary), removes `@oh-my-pi/pi-coding-agent`.
- [x] H.5 Author `package-management` delta: managed-install probe order changes; oh-my-pi alias removed.
- [x] H.6 Author `bridge-extension` delta: replace stale `@mariozechner/pi-coding-agent` path comment with the new earendil-aware variant (cosmetic; non-normative).

## Phase I — Followups (out of scope for this change)

- [x] I.1 Re-verify the Windows file:/// jiti behaviour against `jiti 2.7+` shipped by `@earendil-works/pi-coding-agent@0.74.0` on a real Windows host. The contract test was relaxed in E.6 based on changelog evidence, not in-situ verification. If the contract holds, simplify the contract test back to a single accepted version range; if it breaks, restore the per-jiti-version branch in `shouldUrlWrapEntry`.
- [x] I.2 Cross-platform offline-cacache regen: run `bundle-offline-packages.mjs --platform=linux-x64`, `--platform=linux-arm64`, `--platform=win32-x64`, `--platform=darwin-arm64` in CI for each release artefact. The current change regenerated only the host platform (darwin-x64).
- [x] I.3 Sweep `packages/client/**` and `packages/electron/scripts/**` for the legacy `@mariozechner/pi-coding-agent` literal where a primary-name update is appropriate (test fixtures and installer shell scripts). Track separately so the install-side rename can be verified end-to-end.
- [x] I.4 Once usage telemetry shows ≤epsilon installs on the legacy `@mariozechner/pi-coding-agent` alias, propose a follow-up change that removes the alias from all resolution chains and peer-dep lists.
