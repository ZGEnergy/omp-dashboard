# Design: fix-is-npm-package-installed-exports-map

## Context

Node's `exports` field in `package.json` was introduced in Node 12 and
strictly enforced from Node 14+. When a package declares an `exports`
map, ONLY the subpaths explicitly listed in that map are importable.
`require.resolve("X/Y")` where `Y` is not in the map throws
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

The Node maintainers preserved one historical convenience: `package.json`
SHOULD remain resolvable when not explicitly excluded, BUT this only
holds when the package's `exports` map either:
- doesn't exist at all, OR
- explicitly includes `"./package.json": "./package.json"`, OR
- uses a wildcard `"./*"` that matches.

Many real-world packages (including pi-coding-agent and openspec) have
restrictive `exports` maps with `.` and a few named subpaths, no
`./package.json` entry, and no wildcard. For these, `require.resolve
("X/package.json")` throws.

The PI Dashboard bootstrap uses this exact pattern as its presence
check. Result: on every launch, two of three managed packages report
missing, the bootstrap runs `npm install`, npm prunes the tree, the
dashboard breaks. We discovered this today after fixing the SW and
resolver bugs that were previously masking the breakage.

## Goals / Non-Goals

**Goals:**
- The bootstrap fast-path (`status=satisfied`) MUST fire when packages
  are already present at their pinned versions.
- The wizard's `isManagedDirPopulated` MUST return true under the same
  conditions (the helper checks the same thing for a different
  consumer).
- No regressions in the existing test suite — the check's contract is
  unchanged from the caller's perspective; only the implementation
  changes.
- Pin the new contract with a lint test so this exact bug cannot
  recur.

**Non-Goals:**
- Fix all `require.resolve(pkg + "/X")` calls. Many are legitimate
  (e.g. resolving a module's entry point). Only the
  `pkg + "/package.json"` pattern used as a presence check is
  problematic.
- Make `npm install` non-pruning. Out of scope; tracked separately.
- Compare full transitive trees in the gate. The gate's responsibility
  is "is THIS package installed at the right version?" — not "is the
  dep tree healthy?" That's preflight's job.

## Decisions

### D1. fs.existsSync vs other detection strategies
Options:
- **(A) fs.existsSync on `<managedDir>/node_modules/<name>/package.json`.**
  Deterministic, bypasses exports map, ~1 μs cost.
- **(B) `req.resolve(<name>)` (the package's main entry, not package.json).**
  Still goes through exports map. Fails differently but for the same
  underlying reason on packages without `.` in exports.
- **(C) `req.resolve.paths(name)` + manual probe.**
  Returns the candidate dirs, then probe each. More code, same outcome
  as (A).
- **(D) Use `import.meta.resolve(name)`.**
  Async, ESM-only, and still subject to exports.

**Chosen: A.** Direct filesystem check. The check answers the literal
question being asked ("is this package's directory present?") in the
most direct way. No module-resolution gymnastics, no exports-map
sensitivity. The path is fully deterministic given the npm install
layout that `bootstrapInstall` itself produces.

### D2. Version comparison: opt-in or always-on?
Two options:
- **(A) Compare versions only when `pkg.version` is pinned and not `"*"`.**
  installable.json entries with `version: "0.74.0"` get version-checked;
  ones with `version: "*"` get presence-checked.
- **(B) Always read installed `package.json`'s `version`.** Cache for
  diagnostic logging.

**Chosen: A.** Matches the existing `defaultNpmInstall` behaviour
(which only pins to `@version` when version is set). Avoids an extra
fs read on every iteration when the answer wouldn't influence the
gate.

### D3. Behaviour on corrupt `package.json`
If `<managedDir>/node_modules/<name>/package.json` exists but is
unreadable / not valid JSON, treat as "not installed" → install runs.
This matches the existing behaviour from before the bug (when the
`require.resolve` strategy would have thrown a different error and
returned false).

### D4. Where to share the helper
`bootstrap-install-from-list.ts` and `power-user-install.ts` both have
the same vulnerable pattern. Two options:
- **(A) Fix each in place, duplicate the body.**
- **(B) Extract a single `isPackageInstalledOnDisk(name, managedDir, expectedVersion?)`
  helper into `@blackbelt-technology/pi-dashboard-shared`.** Both
  consumers import it. Single source of truth for the presence check.

**Chosen: B.** The body is 10 lines, but the contract is non-obvious
(why fs.existsSync and not `require.resolve` — that's exactly the
documentation the helper's JSDoc owes). Centralising it gives one
place to attach the JSDoc, the test, and the contract.

Location: `packages/shared/src/managed-package-detect.ts`.

### D5. Lint test
Pattern to ban:
- `require.resolve(SOMETHING + "/package.json")`
- `req.resolve(SOMETHING + "/package.json")`
- `createRequire(...).resolve(SOMETHING + "/package.json")`

Allowlist:
- Test fixtures (path includes `__tests__`).
- Code that explicitly comments `// require-resolve-pkgjson-ok: <reason>`
  on the same line. For e.g. dynamically deriving an installed
  package's path for a different purpose where the exports-map
  exemption is acceptable.

The lint runs in `packages/shared/src/__tests__/no-require-resolve-pkg-package-json.test.ts`
and follows the same pattern as `no-direct-process-kill.test.ts`.

### D6. Unit test fixture
The fixture plants a fake managed dir layout:
```
<tmp>/node_modules/@scope/restricted-exports/package.json   {"version": "1.0.0", "exports": {".": "./index.js"}}
<tmp>/node_modules/@scope/restricted-exports/index.js       (empty)
<tmp>/node_modules/no-exports/package.json                  {"version": "1.0.0"}
```

Asserts:
- `isPackageInstalledOnDisk("@scope/restricted-exports", tmp)` → true
- `isPackageInstalledOnDisk("@scope/restricted-exports", tmp, "1.0.0")` → true
- `isPackageInstalledOnDisk("@scope/restricted-exports", tmp, "2.0.0")` → false
- `isPackageInstalledOnDisk("no-exports", tmp)` → true
- `isPackageInstalledOnDisk("not-there", tmp)` → false

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| fs.existsSync race against a concurrent install. | Same race exists today; the gate is a best-effort fast path, not a transactional guarantee. Worst case: gate says "not installed" → npm install runs → reconciles correctly. |
| Some future installable lives outside `<managedDir>/node_modules/`. | The current installable.json schema doesn't support that. If it does in future, the helper takes the install root as a parameter — easy to extend. |
| The version-comparison branch reads a small file every launch. | Trivial cost (~3 fs syscalls × 3 packages = ~20 μs). The current bug is ~5–10s wasted on every launch. Net massively positive. |
| Direct fs check misses a corrupted symlinked install. | The current `require.resolve` strategy doesn't detect that either. If symlink targets become a thing we care about, add a separate diagnostic; out of scope here. |

## Open Questions

None block implementation.

- Should the helper also detect "package present but `node_modules`
  subtree partially missing" (i.e. the post-prune state we saw today)?
  No — that's a deeper health check, not a presence check. Preflight
  is the right surface for tree-health diagnosis.
- Should we add an env-var bypass (`PI_DASHBOARD_FORCE_REINSTALL=1`)
  for users to manually trigger reinstall? Not needed; `clean:resources`
  + relaunch already covers this. Adding more knobs is over-engineering.
