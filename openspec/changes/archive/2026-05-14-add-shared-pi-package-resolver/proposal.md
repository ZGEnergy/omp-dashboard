## Why

Dashboard plugin bridges that import optional pi extensions as peers (e.g. `flows-anthropic-bridge-plugin` importing `@pi/anthropic-messages`) currently resolve specs with `createRequire(process.cwd()).resolve(spec)`. Node's resolver walks `node_modules/` upward from the cwd, so it finds peers only when they are npm-installed and reachable from the dashboard's working directory. Pi installs packages to **three different filesystem layouts** (`~/.pi/agent/node_modules/<name>` for npm, `~/.pi/agent/git/<host>/<path>/` for git, the user's chosen path for local) — none of which intersect Node's lookup chain. As a result, peers installed exclusively through pi (the common case for `pi-flows`, `pi-anthropic-messages`, and every third-party extension) are invisible to the bridge probe and the bridge sits in `waiting_peers` forever.

Pi already computes the correct absolute install path for every entry in `~/.pi/agent/settings.json#packages[]` (and the per-workspace `<cwd>/.pi/settings.json`), and the dashboard server already reimplements the same walk in `packages/server/src/pi-resource-scanner.ts`. The information exists; it is just not reachable from a plugin bridge running inside a pi session.

## What Changes

- **New shared module** `packages/shared/src/pi-package-resolver.ts` exposing `resolvePiPackage(spec, opts?)` and `resolvePiPackageEntry(spec, opts?)` that walk both global and per-workspace `settings.json#packages[]`, parse each entry's source kind (`npm:`, `git:`, `https://`, abs path, rel path), compute the absolute install directory using pi's own rules, and return the resolved package directory plus the importable entry path (read from `package.json#exports["."]` → `main` → `pi.extensions[0]` → `index.{js,ts}` fallback chain).
- **Tier-2 fallback in plugin peer probes**: extend `flows-anthropic-bridge-plugin`'s `peer-probe.ts` to accept an optional `resolvePiPackage` dependency. Probe tier-1 stays as `createRequire(cwd).resolve(spec)`; on `MODULE_NOT_FOUND`, fall through to `resolvePiPackage(spec)` which returns an absolute entry path. The bridge's dynamic import switches from bare specifier to that absolute path when tier-1 missed.
- **Lint guard** ensuring `packages/shared/src/pi-package-resolver.ts` has no `packages/server/` or `packages/client/` imports so plugin bridges (which can only depend on shared) can actually use it.
- **Test fixtures** for npm-only, git-only, local-only, and mixed install layouts under a tmp `~/.pi/agent/` to cover each parsed source kind.

This is purely additive. The existing tier-1 path is unchanged. Plugins that don't opt in keep their current resolver behavior.

## Capabilities

### New Capabilities
- `pi-package-resolver`: shared helper that resolves a package name to an absolute install path + entry file by reading pi's `settings.json#packages[]` files and applying the same path-computation rules pi uses internally. Handles `npm:`, `git:`/`https:`/`ssh:` URLs, and absolute/relative local paths. Read-only; performs no installs and never mutates settings.

### Modified Capabilities
<!-- none — consumer wiring (peer-probe tier-2, bridge import switch) is implementation detail tracked in tasks.md, not a spec-level behavior change on dashboard-plugin-loader. -->

## Impact

- **Affected code (new):** `packages/shared/src/pi-package-resolver.ts` (+~120 lines), `packages/shared/src/__tests__/pi-package-resolver.test.ts` (+~150 lines).
- **Affected code (modified):** `packages/flows-anthropic-bridge-plugin/src/peer-probe.ts` (tier-2 fallback, ~20 LOC delta), `packages/flows-anthropic-bridge-plugin/src/bridge/index.ts` (dynamic import switches to absolute path on tier-2 hit, ~10 LOC delta).
- **APIs surfaced:** `resolvePiPackage(spec, opts?)` and `resolvePiPackageEntry(spec, opts?)` exported from `@blackbelt-technology/pi-dashboard-shared/pi-package-resolver`.
- **No breaking changes.** Existing peer-probe callers that don't pass `resolvePiPackage` keep tier-1-only behavior.
- **No upstream pi changes required.** This closes the gap from the dashboard side while pi-coding-agent could later expose a native `pi.packages.resolveByName(spec)` on `ExtensionAPI`; if it does, the shared helper becomes a thin wrapper.
- **Relation to existing proposals:** supersedes fix #2 of `fix-flows-anthropic-bridge-resolution` (the inline pi-cache fallback in `peer-probe.ts`). Fix #1 (`main`/`exports` on pi-packages) and fix #3 (dual-write to `packages[]`) of that proposal are already shipped in current main and remain orthogonal to this change.
- **Future leverage:** any future dashboard plugin needing to import a peer pi extension can call `resolvePiPackage()` from its bridge entry without declaring the peer as an npm dependency or assuming a cwd-reachable install.
