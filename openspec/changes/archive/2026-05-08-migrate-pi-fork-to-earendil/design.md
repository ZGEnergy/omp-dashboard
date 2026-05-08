## Context

Pi has been forked across npm scopes over its lifetime. The dashboard's resolution chains have accreted alias arrays to handle this — at one point `[@mariozechner, @oh-my-pi]` for both the agent package and its bundled jiti loader. As of pi 0.74 the active fork is `@earendil-works/*` and the loader is plain `jiti` (no namespace). The `@oh-my-pi` line was a transient fork that no longer publishes.

This change is mechanical (textual rename across ~50 files plus alias-array reordering), but the **ordering** and **fallback retention** decisions matter and are documented here.

## Decisions

### D1: `@earendil-works` first, `@mariozechner` retained as legacy fallback

**Decision**: every alias array (lookup, install, peer-dep, error-message hint) puts `@earendil-works/pi-coding-agent` FIRST and `@mariozechner/pi-coding-agent` SECOND. The legacy alias is **not** dropped.

**Why first?**
- The build the dashboard tests against, ships against, and recommends in `npm install -g …` strings is now `@earendil-works`. New installs and the tooling-first probe order should match the recommended target.
- `createRequire(anchor).resolve(<pkg>/package.json)` does not "shop" — it tries names in order. With earendil-pi installed globally, anchoring at pi's CLI, plain `jiti` resolves on the FIRST attempt and the others are never even tried. With mariozechner-pi installed, the first attempt fails fast (one filesystem stat) and the second succeeds. Cost of the dual-name list is one extra stat per cold start in the legacy case — negligible.

**Why keep the legacy alias?**
- The dashboard installs older mariozechner builds via `bootstrap-install` and the offline cache (still pinned to `@mariozechner/pi-coding-agent` in `offline-packages.json`). Until those flip together (Phase H follow-up), removing the legacy alias would break the offline-install path.
- Existing user installs of `@mariozechner/pi-coding-agent` should continue to work. A graceful migration matters more than alias-list purity.

### D2: `@oh-my-pi` deleted entirely (not retained as third-tier)

**Decision**: every reference to `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-ai`, `@oh-my-pi/pi-tui`, `@oh-my-pi/jiti` is removed.

**Why?**
- `@oh-my-pi` was a transient personal fork that no longer publishes. Carrying its name forward is dead weight: it appears in error messages confusing users, in peerDependenciesMeta bloating the manifest, and in alias arrays adding wasted probe attempts.
- No telemetry, support ticket, or active install in our user base references it. The cost-of-carry exceeds the cost-of-removal.
- A user who had `@oh-my-pi/pi-coding-agent` installed will see the new error message ("Is `@earendil-works/pi-coding-agent` or `@mariozechner/pi-coding-agent` installed?") and can `npm install -g` either supported name. No silent breakage.

### D3: Plain `jiti` first (not `@earendil-works/jiti`)

**Decision**: `JITI_PACKAGES = ["jiti", "@mariozechner/jiti"]`.

**Why plain `jiti`?**
- The earendil-works pi build depends on the upstream un-namespaced `jiti` package (see `@earendil-works/pi-coding-agent/package.json`: `"jiti": "^2.7.0"`). It does NOT publish a `@earendil-works/jiti` namespace.
- The legacy mariozechner pi build pinned a fork at `@mariozechner/jiti` for unrelated patch reasons. Until that fork is retired upstream, the dashboard must still resolve it from a mariozechner-anchored `createRequire`.

**Why bare-name first?**
- Same reasoning as D1: the active build uses plain `jiti`, so probing it first is one stat → success. With the legacy build, plain-jiti stat fails fast and `@mariozechner/jiti` succeeds.
- Safer ordering: `createRequire(piCli).resolve("jiti/package.json")` from inside `@mariozechner/pi-coding-agent`'s context will NOT accidentally resolve some other package called `jiti` higher up the tree, because Node's resolution starts at the anchor's own `node_modules` and walks up. The earendil pi tarball ships its own pinned `jiti` in its bundled `node_modules/`, so the resolution is anchored — it cannot leak to a root-level `jiti` from the project the user happens to have open.

### D4: pi-env.d.ts re-exports, not duplicates, the legacy module

**Decision**: `pi-env.d.ts` declares `@earendil-works/pi-coding-agent` as the source-of-truth `ExtensionAPI` type, and `@mariozechner/pi-coding-agent` re-exports the same type via `export type ExtensionAPI = import("@earendil-works/pi-coding-agent").ExtensionAPI` (and equivalent for other named exports).

**Why?**
- A duplicate declaration risks drift: someone updates the earendil declaration, forgets the mariozechner mirror, and TypeScript silently allows code that targets the stale legacy types. Re-export keeps a single source of truth.
- The legacy declaration block exists ONLY so that `import type { … } from "@mariozechner/pi-coding-agent"` (which the bundled extension under a legacy install resolves to a real package on disk) still type-checks against an accurate signature. With the re-export, "accurate signature" is automatic.

### D5: cwd fix scope

**Decision**: only `launchViaCli`'s spawn cwd is changed; the diagnostic `cwd: process.cwd()` in `buildServerStartupError` and the `selectLaunchSource({ cwd: process.cwd(), ... })` call in `main.ts` are LEFT alone.

**Why?**
- `buildServerStartupError` reports cwd in a multi-line error message for support diagnostics. The desired value there is the actual GUI launch cwd ("user launched the app from `/`") — replacing it with `MANAGED_DIR` would erase the diagnostic.
- `selectLaunchSource` consumes cwd to decide which install variant to pick (e.g., dev-mode detection looks for a parent `package.json`). That rule wants the GUI launch cwd, not the managed dir.
- The bug is specific to the **spawn** of the CLI shebang, where cwd determines `--import tsx` bare-specifier resolution. Surgical fix preserves the other two call sites' intentional semantics.

## Risks / Trade-offs

### R1: Test snapshot churn
9 bootstrap snapshots were deleted because alias order changed. They regenerate on first `vitest run`. Risk: if the regenerated snapshot accidentally encodes an UNRELATED behaviour change, it'll be silently committed.

**Mitigation**: review the regenerated snapshots in the same commit that resurrects them. Specifically check that resolution-trail strings show `@earendil-works` first, `@mariozechner` second, no `@oh-my-pi`.

### R2: Offline-cache contract test
`packages/shared/src/__tests__/node-spawn-jiti-contract.test.ts` asserts `offline-packages.json` contains `@mariozechner/pi-coding-agent`. We deliberately did NOT flip that — the offline cache itself is still the legacy build (Phase H follow-up republishes both together).

**Mitigation**: out-of-scope flagged in proposal; the contract test continues to pass against the unchanged manifest. Future work tracked in tasks H.1.

### R3: Type-import compatibility on dual-fork installs
A user who has BOTH `@earendil-works/pi-coding-agent` and `@mariozechner/pi-coding-agent` installed (unusual but possible during their own migration) sees the dashboard's TypeScript code import from `@earendil-works/...`. If the two installs have **different** `ExtensionAPI` shapes (semver gap), the dashboard binds to whichever is preferred by `node_modules` lookup — and that's earendil first, which is the desired primary.

**Mitigation**: documented as "primary fork wins, legacy fork is fallback only". If a user pinned an old mariozechner build deliberately, they uninstall earendil to get back to the legacy types. The pi-env.d.ts re-export means the legacy `import "@mariozechner/..."` still resolves to the same `ExtensionAPI` symbol, so source code is portable.

### R4: Electron app cold-start cwd
The cwd fix in `launchViaCli` assumes `MANAGED_DIR` exists at the time of spawn. If a user wipes `~/.pi-dashboard/` between launches, `cwd: MANAGED_DIR` resolves to a non-existent path and `child_process.spawn` errors with `ENOENT`.

**Mitigation**: the bootstrap path that creates `~/.pi-dashboard/` runs **before** any spawn attempt (it's the prerequisite for the symlink target to exist in the first place). If the dir is missing, the spawn would have failed regardless of cwd because the binary at `cliPath` wouldn't exist either. Additionally, the `mkdirSync(logDir, { recursive: true })` call earlier in `launchViaCli` already touches `MANAGED_DIR` before spawn.

## Migration

No data migration. End-user impact:
- Users on `@earendil-works/pi-coding-agent`: dashboard now works (was broken).
- Users on `@mariozechner/pi-coding-agent`: no change.
- Users on `@oh-my-pi/pi-coding-agent`: must `npm install -g` one of the two supported names.

No rollback plan needed beyond reverting the change — alias removal is non-destructive.

## Open questions

- None. Phase H follow-ups are tracked but not blockers for this change.
