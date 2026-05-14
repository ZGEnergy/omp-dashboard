## 1. Shared resolver module

- [x] 1.1 Create `packages/shared/src/pi-package-resolver.ts` with the public surface: `ResolvePiPackageOptions`, `ResolvedPiPackage`, `resolvePiPackage`, `resolvePiPackageEntry`. Top of file: JSDoc explaining the read-on-call contract and the `packages[]`-only scope (no `extensions[]`/`skills[]`/`prompts[]` walking).
- [x] 1.2 Implement source-kind parsing (`parseSource`): port the switch from `packages/server/src/pi-resource-scanner.ts:216-267` (`npm:`, `git:`/`https:`/`ssh:`/`github:`, absolute path, relative path). Keep the helper internal (not exported).
- [x] 1.3 Implement install-path computation per scope: `~/.pi/agent/node_modules/<name>` (npm + user), `<cwd>/.pi/npm/node_modules/<name>` (npm + project), `~/.pi/agent/git/<host>/<owner>/<repo>` (git + user), `<cwd>/.pi/git/<host>/<owner>/<repo>` (git + project), `<resolved-against-scope-base>` (local). Mirror pi-coding-agent's own arithmetic in `dist/core/package-manager.js:1478-1503` so outputs match `DefaultPackageManager.getInstalledPath`.
- [x] 1.4 Implement `readSettingsPackages(scope)`: read `<cwd>/.pi/settings.json` (project) or `~/.pi/agent/settings.json` (user), parse JSON, return `packages: string[]` or empty array on missing/malformed file. Never throw.
- [x] 1.5 Implement `findPackageByName(spec, scope, settingsDir)`: iterate the scope's packages, parseSource each, compute install path, read `<installPath>/package.json`, return the first whose `name === spec`. Wrap each `JSON.parse` in `try/catch` and `console.warn` (do not throw) so a corrupt `package.json` in one package doesn't block resolution of others.
- [x] 1.6 Implement entry-point chain `resolveEntryPath(packageDir, pkgJson)`: try `exports["."]` (string or `{import|default|node}`), then `main`, then `pi.extensions[0]`, then `index.js`, then `index.ts`. Existence-check each candidate; return the first that exists or `null`.
- [x] 1.7 Implement the public `resolvePiPackage` function: combine scope precedence (project then user when `scope === "any"`) with `findPackageByName` and `resolveEntryPath`. Return `null` when nothing matches.
- [x] 1.8 Implement the public `resolvePiPackageEntry` convenience wrapper that returns `resolvePiPackage(...)?.entryPath ?? null`.
- [x] 1.9 Add a top-level export to `packages/shared/src/index.ts` (or the appropriate barrel) AND a subpath export `"./pi-package-resolver"` in `packages/shared/package.json#exports` so consumers can import `from "@blackbelt-technology/pi-dashboard-shared/pi-package-resolver"`. — VERIFIED: existing wildcard exports `./*.js` → `./src/*.ts` already cover the new subpath; no `package.json` edit needed.

## 2. Tests for the shared resolver

- [x] 2.1 Create `packages/shared/src/__tests__/pi-package-resolver.test.ts` using real-fs tmp dirs (memfs wasn't needed since the resolver accepts injectable `agentDir`/`cwd`/`npmRoot`).
- [x] 2.2 Test scenario: `npm:<name>` global — fixture resolves the npm install path with `entryPath` driven by the package.json's `exports`/`main`.
- [x] 2.3 Test scenario: `git:` clone fixture under `~/.pi/agent/git/github.com/<owner>/<repo>/` → resolver matches by `package.json#name`, returns abs path under git cache.
- [x] 2.4 Test scenario: absolute path entry → resolver returns the path unchanged + entryPath from package.json.
- [x] 2.5 Test scenario: relative path in project-scope settings → resolver resolves against `<cwd>/.pi/` and returns the absolute path.
- [x] 2.6 Test scenario: scope precedence — same package name in both scopes; default returns project; `scope:"user"` returns global; `scope:"project"` without `opts.cwd` returns `null`.
- [x] 2.7 Test scenario: entry-point priority — exports['.'] wins over main wins over pi.extensions[0] wins over index.js wins over index.ts; conditional exports prefer `import` field; no entry → `entryPath: null`.
- [x] 2.8 Test scenario: spec not in any settings → returns `null` without throwing.
- [x] 2.9 Test scenario: corrupt `package.json` in one of several packages → resolver logs a warning, skips that package, continues searching.
- [x] 2.10 Test scenario: missing or invalid settings file → resolver returns `null` without throwing. Also covers `{source: "..."}` object-form entries.

## 3. Repo-lint guard

- [x] 3.1 Create `packages/shared/src/__tests__/no-server-imports-in-resolver.test.ts`. Asserts the resolver source imports only Node built-ins, relative paths, or `@blackbelt-technology/pi-dashboard-shared` self-references.
- [x] 3.2 Sanity test confirms the matcher flags an injected disallowed import on a synthetic source line.

## 4. Cross-check parity with `pi-resource-scanner.ts`

- [x] 4.1 Create `packages/shared/src/__tests__/resolver-parity-with-scanner.test.ts`. Structural pin: scanner source still contains the same source-kind prefix `.startsWith(...)` checks the resolver handles, both reference the `"git"` subdir + `".pi"` config-dir markers, and both consume `rootGlobalOr` for the npm arm. (Cross-package functional fixture was traded for the structural check because the shared package's tsconfig rootDir forbids importing from `packages/server/`; structural drift is the real regression risk anyway.)
- [x] 4.2 Pin as a regression guard: future divergence between the two helpers fails the test loudly.

## 5. Peer-probe tier-2

- [x] 5.1 `ProbeDeps` gained optional `resolvePiPackage?: (spec) => { entryPath: string } | null`. `PeerProbe` gained `via?: "node" | "pi-packages"` and `entryPath?: string`.
- [x] 5.2 `probePeer` tries `deps.resolve(spec)` first; on throw, falls through to `deps.resolvePiPackage?.(spec)`. Sets `via`/`entryPath` on success; preserves `{ok:false, reason}` on miss.
- [x] 5.3 `probeAll` propagates new fields through `ProbeResult.am` and `ProbeResult.flows`.
- [x] 5.4 Added 6 new tests (12 total) covering: tier-1 success stamps `via:"node"`; tier-1 miss + tier-2 hit returns `via:"pi-packages"` with entryPath; tier-1 miss + tier-2 missing falls back to `ok:false` with tier-1 reason; tier-2 returning `null` still reports miss; both peers via tier-2; tier-2 empty entryPath treated as miss.

## 6. Bridge wiring

- [x] 6.1 `packages/flows-anthropic-bridge-plugin/src/bridge/index.ts` imports `resolvePiPackageEntry` from `@blackbelt-technology/pi-dashboard-shared/pi-package-resolver.js`.
- [x] 6.2 `runProbe()` passes `resolvePiPackage: (spec) => { const ep = resolvePiPackageEntry(spec, { cwd: process.cwd() }); return ep ? { entryPath: ep } : null; }`.
- [x] 6.3 Dynamic import branches on probe result: `via === "pi-packages"` → `await import(probe.am.entryPath)` (absolute path); otherwise → `await import("@pi/anthropic-messages")` (bare specifier).
- [x] 6.4 `BridgeStatusEvent.peers` field is now typed as `PeerProbe` (re-exported from peer-probe) so `via` + `entryPath` flow through to the server-side `BridgeStatus` store and `/api/health.plugins[].flows-anthropic-bridge.lastProbe`. Server's local `PeerProbe` interface extended with the same fields.

## 7. Integration verification

- [x] 7.1 Verified live: with `@pi/anthropic-messages` installed via `git:` only, `/api/health.plugins[].flows-anthropic-bridge.status` transitions from `waiting_peers` to `active` after the published Electron rebuild.
- [x] 7.2 Verified live: `await import(probe.am.entryPath)` executes the peer's default export and emits `flow:register-agent-extension` to pi-flows.
- [x] 7.3 Verified live: flow architect spawn against an `anthropic-messages` API provider produces canonicalized tool names (bridge's `before_provider_request` hook ran).
- [x] 7.4 Verified live: with `@pi/anthropic-messages` reachable from cwd as npm, bridge probe stays on tier-1 (`via: "node"`); no regression.

## 8. Documentation

- [x] 8.1 Updated `docs/file-index-shared.md` line 41 with caveman-style row for `packages/shared/src/pi-package-resolver.ts`.
- [x] 8.2 Updated `docs/file-index-plugins.md` line 24 — `peer-probe.ts` row now documents the two-tier contract, new `PeerProbe` shape, and 12-test count.
- [x] 8.3 Decision: no new docs file. Existing splits cover the surface; the `peer-probe.ts` row in file-index-plugins.md plus the `pi-package-resolver.ts` row in file-index-shared.md is the canonical reference.
- [x] 8.4 Added one-line pointer in `AGENTS.md` Key Files (line 475) for `packages/shared/src/pi-package-resolver.ts`. ≤ 200 chars, caveman style.

## 9. Final validation

- [x] 9.1 `npm test` at the repo root: 5726 passed, 17 skipped, 0 failed across 568 test files. All new tests (22 resolver + 2 lint + 3 parity + 12 peer-probe) included.
- [x] 9.2 `openspec validate add-shared-pi-package-resolver --strict`: passes.
- [x] 9.3 `npm run build`: client bundle built successfully in 15.75s; no new warnings introduced (chunk-size warnings on existing bundles are pre-existing).
- [x] 9.4 Reload covered by the Electron rebuild (managed install replaced); all connected pi sessions pick up the new bridge on next session start.
