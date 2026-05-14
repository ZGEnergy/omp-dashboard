## Context

`flows-anthropic-bridge-plugin` (and any future dashboard plugin that imports an optional pi extension as a peer) needs to dynamically `import()` a peer package whose install location depends on how the user installed it. Pi-coding-agent supports three install kinds via `~/.pi/agent/settings.json#packages[]` entries:

| Kind | Detection | Disk layout (global scope) | Disk layout (project scope) |
|---|---|---|---|
| `npm:<name>[@version]` | startsWith `"npm:"` | `~/.pi/agent/node_modules/<name>/` | `<cwd>/.pi/npm/node_modules/<name>/` |
| `git+ssh://…`, `https://…`, `git://…` | known protocol prefix | `~/.pi/agent/git/<host>/<owner>/<repo>/` | `<cwd>/.pi/git/<host>/<owner>/<repo>/` |
| absolute path | `path.isAbsolute()` | the path itself | the path itself |
| relative path | else | `path.resolve(~/.pi/agent, entry)` | `path.resolve(<cwd>/.pi, entry)` |

None of these locations are on Node's `node_modules` walk from `process.cwd()`, so the bridge's `createRequire(cwd).resolve(spec)` fails for every pi-installed peer. The same computation already exists in two places:

- Internal to pi: `DefaultPackageManager.getInstalledPath(source, scope)` in `~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.js:623-638`. Not exposed on the `ExtensionAPI` that extensions receive at activation.
- Server-side in the dashboard: `packages/server/src/pi-resource-scanner.ts::resolvePackagePath` (lines 216-267) and `resolvePackages` (lines 300-330). Used by `/api/pi-resources` and the Packages UI. Lives in `packages/server/` so plugin bridges (which can only depend on `packages/shared/`) can't import it.

The fix is to make the existing logic reachable from plugin bridges by moving it into `packages/shared/` and adding a name-lookup wrapper.

Constraints:
- Plugin bridges run inside pi sessions and may have *no network access*. The resolver must be pure filesystem reads.
- Bridges may run before any pi session is fully bootstrapped. The resolver cannot depend on pi runtime state — only on the two settings files on disk.
- Per-workspace settings (`<cwd>/.pi/settings.json`) must be consulted when a `cwd` is known, with project-scope entries winning over user-scope (matching pi's own `deepMergeSettings` rule).
- The resolver must not import anything from `packages/server/` or `packages/client/`. Enforced by repo lint.

## Goals / Non-Goals

**Goals:**
- A single `resolvePiPackage(spec, opts?)` call that returns `{ packageDir, entryPath } | null` for any peer pi extension, regardless of install kind.
- Symmetry with pi's own resolution: identical npm/git/local arms, identical scope precedence, identical normalization of relative paths.
- Zero dependencies beyond Node built-ins so the helper is consumable from plugin bridges, server, client, and electron equally.
- Unblock `flows-anthropic-bridge-plugin` to import `@pi/anthropic-messages` and `pi-flows` regardless of how the user installed them.
- Open the same primitive to any future dashboard plugin needing peer imports.

**Non-Goals:**
- Modifying pi-coding-agent. If pi later exposes `pi.packages.resolveByName(spec)` on `ExtensionAPI`, the shared helper becomes a thin wrapper — but we ship without that change.
- Watching settings files for changes. The helper is read-on-call; staleness handling stays a separate concern.
- Installing, removing, or mutating packages. Read-only.
- Resolving non-pi packages (e.g. arbitrary npm modules from `node_modules/`). Tier-1 (`createRequire`) already handles those.
- Inferring entry points for packages with neither `pi.extensions[]`, `exports`, nor `main`. Such packages fall through to `null`; callers can choose to attempt `index.js`/`index.ts` themselves but the resolver doesn't guess.

## Decisions

### D1. Module location: `packages/shared/src/pi-package-resolver.ts`

**Decision:** New file under `packages/shared/src/`. Exported as a top-level entry of `@blackbelt-technology/pi-dashboard-shared`.

**Alternatives considered:**
- New workspace package (`packages/pi-package-resolver/`). Rejected: overhead for ~120 lines of code; introduces a new internal dep edge for every consumer.
- Inside `packages/dashboard-plugin-runtime/`. Rejected: that package is a peer-import-restricted plugin runtime, not a general utility. The resolver is useful from server, client, electron, and standalone plugins — broader than the runtime's scope.
- Re-export from `pi-resource-scanner.ts` directly. Rejected: `packages/server/` is unreachable from plugin bridges, which is the primary caller.

**Rationale:** `packages/shared/` is already the catch-all for cross-package primitives (`platform/`, `tool-registry/`, `bridge-register.ts`). The resolver fits the same shape: pure logic, no I/O assumptions beyond filesystem, no React, no pi runtime.

### D2. Public API surface

**Decision:** Two exported functions:

```ts
export interface ResolvePiPackageOptions {
  agentDir?: string;        // default: ~/.pi/agent
  cwd?: string;             // optional; enables per-workspace settings lookup
  scope?: "user" | "project" | "any";  // default: "any" (project wins over user)
}

export interface ResolvedPiPackage {
  packageDir: string;       // absolute path to the package root
  entryPath: string | null; // absolute path to the importable entry file, or null
  scope: "user" | "project";
  source: string;           // the original settings.json entry string
  packageJsonName: string | null;  // from package.json#name; null if no package.json
}

export function resolvePiPackage(
  spec: string,
  opts?: ResolvePiPackageOptions,
): ResolvedPiPackage | null;

export function resolvePiPackageEntry(
  spec: string,
  opts?: ResolvePiPackageOptions,
): string | null;  // convenience: returns ResolvedPiPackage.entryPath or null
```

`spec` matches against `package.json#name`. Lookups by raw settings entry are not in the public API — that's an internal step.

**Alternatives considered:**
- Single function returning string entry path only. Rejected: callers benefit from knowing the `packageDir` (e.g., to read other files relative to it) and which scope it came from (for debug logging).
- Async API (`Promise<ResolvedPiPackage>`). Rejected: pi-coding-agent's own resolver is sync; settings files are tiny; making the public API async forces async on every caller for no benefit.
- Cache the result in a module-level Map. Rejected: same staleness risk we just fixed for roles; if a peer is installed mid-run via `pi install`, callers should see fresh state on the next call. The two settings reads + N package.json reads are cheap (sub-millisecond) and the call frequency is bounded (once per probe, once per dynamic import retry).

### D3. Source-kind parsing: copy, don't import

**Decision:** Replicate `pi-resource-scanner.ts::resolvePackagePath` in the new file rather than refactoring server code to depend on shared. Both files will exist in parallel.

**Rationale:** `pi-resource-scanner.ts` is server-only and bundles other server concerns (resource type detection, recursive scanning, listing extensions vs skills vs prompts). Lifting only the path-resolution arm to shared keeps the surface small. The duplication is ~50 LOC of pure switch-on-prefix logic — acceptable. A follow-up cleanup can have `pi-resource-scanner.ts` consume the shared helper, but is out of scope for this change.

**Alternatives considered:**
- Move `pi-resource-scanner.ts` entirely to `packages/shared/`. Rejected: it has server-side concerns (resource categorization, scanning depth) that don't belong in shared.
- Lift to shared and re-import from server. Rejected: enforces a refactor in `pi-resource-scanner.ts` that's incidental to this change.

### D4. Entry-point resolution chain

**Decision:** When `package.json` is present at `packageDir`, resolve `entryPath` via this priority chain:

1. `package.json#exports["."]` — string or `{import|default|node|require}`
2. `package.json#main`
3. `package.json#pi.extensions[0]` (pi's own metadata field, used by `pi-flows` / `pi-anthropic-messages` historically)
4. `index.js` if it exists in `packageDir`
5. `index.ts` if it exists in `packageDir`
6. `null` (caller decides how to surface "package found, no entry")

Each candidate is resolved against `packageDir` and existence-checked before returning.

**Rationale:** Matches Node's resolution priority (`exports` then `main`) with pi-specific fallbacks (`pi.extensions`) and a final filesystem-existence safety net. The order means "modern packages with `exports`" win, falling back gracefully to legacy pi packages.

**Alternatives considered:**
- Only `package.json#exports` + `#main`. Rejected: pre-`main` pi packages (we have several in the wild) would resolve to `null` even though their entry is at `extensions/index.ts`.
- Try multiple `pi.extensions[]` entries. Rejected: the resolver returns one entry; multi-entry extensions are typically loaded by pi's own loader, not by a peer. Callers needing multi-entry can read `packageDir/package.json` themselves.

### D5. Scope precedence

**Decision:** When `opts.scope === "any"` (default):
1. Read `<cwd>/.pi/settings.json` if `cwd` provided and file exists.
2. Read `~/.pi/agent/settings.json`.
3. Walk project-scope entries first; first matching `package.json#name === spec` wins. Then user-scope.

When `opts.scope === "project"`: skip user-scope. When `opts.scope === "user"`: skip project-scope.

**Rationale:** Mirrors pi's own `deepMergeSettings(globalSettings, projectSettings)` — project-scope wins. Plugin bridges typically want any reachable peer, so `"any"` is the default. Letting callers force one scope gives them control without dictating policy.

### D6. Tier-2 wiring in `peer-probe.ts`

**Decision:** `ProbeDeps` gains an optional `resolvePiPackage?: (spec: string) => { entryPath: string } | null`. `probePeer` tries `deps.resolve(spec)` first (tier-1, unchanged); on throw, falls through to `deps.resolvePiPackage?.(spec)` if provided. The `PeerProbe` result type gains a `via?: "node" | "pi-packages"` field plus an `entryPath?: string` when tier-2 wins, so the caller can dynamic-`import()` the absolute path.

The bridge entry (`flows-anthropic-bridge-plugin/src/bridge/index.ts`) injects the dependency:

```ts
import { resolvePiPackageEntry } from "@blackbelt-technology/pi-dashboard-shared/pi-package-resolver";
// …
const probe = probeAll({
  resolve: (spec) => requireFromCwd.resolve(spec),
  resolvePiPackage: (spec) => {
    const ep = resolvePiPackageEntry(spec, { cwd: process.cwd() });
    return ep ? { entryPath: ep } : null;
  },
  flowsListenerCount: () => /* … */,
});
```

And the dynamic import switches:

```ts
mod = probe.am.via === "node"
  ? await import("@pi/anthropic-messages")
  : await import(probe.am.entryPath!);
```

**Rationale:** Tier-2 is opt-in (existing callers unaffected). The `via` discriminator on the probe result lets the consumer decide whether to import by bare specifier or absolute path. No changes to `probeAll`'s outer signature beyond the new optional `ProbeDeps` field.

### D7. Test strategy

**Decision:** Vitest unit tests with `memfs` (already used by `bootstrap/` tests in `packages/shared/src/__tests__/`). Build four fixture scenarios:

1. Peer installed only as `npm:` under `~/.pi/agent/node_modules/<name>/`.
2. Peer installed only as `git:` under `~/.pi/agent/git/<host>/<path>/`.
3. Peer installed as absolute local path.
4. Peer installed as relative local path under project-scope `<cwd>/.pi/settings.json`.

Plus negative tests: missing package.json (returns `packageDir` but `entryPath: null`); spec doesn't match any settings entry (returns `null`); two entries with the same name across scopes (project-scope wins).

`peer-probe.ts` tests use the existing fake-resolver pattern with a stub `resolvePiPackage` to verify tier-2 fall-through. The bridge entry is not unit-tested directly (it has too many wiring concerns); a thin integration test under `flows-anthropic-bridge-plugin/src/__tests__/` verifies that when tier-1 throws `MODULE_NOT_FOUND` and tier-2 returns an entry path, the `via: "pi-packages"` branch is taken.

### D8. Repo-lint addition

**Decision:** A new `packages/shared/src/__tests__/no-server-imports-in-resolver.test.ts` walks `pi-package-resolver.ts` source and asserts no import statement references `packages/server/`, `packages/client/`, `packages/electron/`, or any non-`packages/shared/` workspace.

**Rationale:** Plugin bridges depend only on `packages/shared/`. A regression where someone "helpfully" imports a server-only path from this file would silently break every consumer outside the server. Lint catches it at PR time.

## Risks / Trade-offs

- **Risk:** Source-kind parsing drifts between `pi-package-resolver.ts` (shared) and `pi-resource-scanner.ts` (server). **Mitigation:** Add a cross-file test in `packages/shared/src/__tests__/` that exercises the same set of source-string inputs against both helpers' parse functions and asserts they agree, until a follow-up change merges the two.
- **Risk:** `package.json` parse failures (truncated file mid-write by `pi install`) cause the resolver to return `null` for an installed package. **Mitigation:** Wrap the read in `try/catch`; on parse error, log a `console.warn` and continue to the next candidate scope. The probe will fall through to `waiting_peers` rather than crashing.
- **Risk:** Symlinked `node_modules` under `~/.pi/agent/node_modules/` (e.g. pnpm) confuse the existence check. **Mitigation:** Use `fs.existsSync` (follows symlinks) consistently. Document in a comment that the resolver follows symlinks but does not resolve realpath — if `packageDir` is a symlink, that's the returned value.
- **Risk:** Future pi versions change the install path layout (e.g. `~/.pi/agent/npm/` → `~/.pi/agent/node_modules/`). **Mitigation:** A snapshot test that imports `getInstalledPath`'s arithmetic from a vendored pi build and asserts the resolver's outputs match for a fixture matrix. If the layout changes, the test fails loudly and the resolver gets updated in lockstep.
- **Trade-off:** Read-on-call costs ~5 file `readFileSync` operations per probe (two settings files + up to three `package.json`s along the scope/match chain). Worst case <1 ms per resolution. The alternative (a module-level cache) reintroduces the exact staleness pattern we just fixed for role-manager. Not worth the speedup.
- **Trade-off:** The shared helper duplicates ~50 LOC from `pi-resource-scanner.ts`. Accepted; a follow-up change can deduplicate by having the scanner consume the shared helper, after this change ships.

## Migration Plan

This change is purely additive:

1. Land `pi-package-resolver.ts` + tests.
2. Land `peer-probe.ts` tier-2 (optional, no behavior change unless `resolvePiPackage` is passed).
3. Wire the bridge entry to pass `resolvePiPackage` and use the absolute path when tier-2 wins.
4. Run the dashboard with a known-bad install (e.g., `@pi/anthropic-messages` installed only via `git:`); confirm `/api/health.plugins[].flows-anthropic-bridge` reports `active` instead of `waiting_peers`.

No rollback procedure needed — the change is opt-in at the call site. If the bridge integration misbehaves, revert the `bridge/index.ts` edit; tier-1 path resumes.

## Open Questions

- **Should `resolvePiPackage` also walk pi's `extensions[]`, `skills[]`, `prompts[]` top-level settings keys?** Currently it only walks `packages[]`. The other arrays hold strings pointing to *individual files*, not package roots, so `package.json#name` lookup doesn't apply. Decision: keep scope to `packages[]` only. Document the limit in the function's JSDoc.
- **Future: expose this from pi upstream.** Open question for `@earendil-works/pi-coding-agent` maintainers: add `pi.packages.resolveByName(spec)` to `ExtensionAPI`. If accepted, the shared helper stays as the fallback for environments running an older pi version.
