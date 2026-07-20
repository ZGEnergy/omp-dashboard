# Design — Nightly Verdaccio Build

## Context

The release pipeline (`publish.yml`) couples two stages by necessity:

```
resolve → [ci-checks · smoke · tag-and-push] → publish(npm) → electron → github-release
                                                     │  electron needs: [resolve, publish]
                                                     ▼  bundle-server.mjs `npm install`
                                              resolves @blackbelt-technology/*
                                              FROM the public registry
```

`electron needs publish` exists because `bundle-server.mjs` runs `npm install --omit=dev` inside a synthetic workspace whose `workspaces:` field lists only 4 packages (`server, shared, extension, dashboard-plugin-runtime`). Those resolve locally; their scoped deps that are **not** in that list resolve from the registry:

| Bundled workspace pkg | Scoped dep resolved FROM REGISTRY |
|---|---|
| `extension` | `pi-dashboard-bus-client` |
| `server` | `pi-dashboard-document-converter` (+ its transitive `@blackbelt-technology/*`) |

A nightly that wants full fidelity must therefore stand up a registry serving those packages — but a **throwaway** one.

## Goals / Non-goals

**Goals**
- Nightly signal that a real release would succeed: publish → install → bundle → run.
- **Zero writes to npmjs.com.**
- Reuse `_electron-build.yml` — do not fork the build.
- Catch bundle-composition drift (missing plugins).

**Non-goals**
- Consumable public nightly (`@nightly` dist-tag) — rejected.
- Per-merge continuous preview — deferred.
- Signed/notarized nightly artifacts.

## Decision 1 — Verdaccio over dist-tag / pkg.pr.new / dry-run

| Option | Verifies install round-trip | Verifies bundle `npm install` path | Public npm writes |
|---|---|---|---|
| `npm publish --dry-run` | ✗ | ✗ | 0 |
| `@nightly` dist-tag | ✓ | ✓ | **365/yr (quarantined)** |
| pkg.pr.new | ✓ | ~ (URL, not a registry) | 0 |
| **Verdaccio** | **✓** | **✓ (real registry, local)** | **0** |

Verdaccio is the only zero-write option that exercises `bundle-server.mjs`'s registry-resolving `npm install` verbatim. `dry-run` is kept as a cheap *additional* pre-gate (pack + publish validation), not the fidelity layer.

## Decision 2 — Local-only scope, no proxy fallthrough

Verdaccio `packages['@blackbelt-technology/*']` has **no `proxy`**. Consequences:

- A local publish of `<base>` (e.g. `0.5.4`) cannot `EPUBLISHCONFLICT` against the public `0.5.4`, because Verdaccio never consults the uplink for our scope.
- `^<base>` specifiers in the bundled workspace pkgs resolve to the **working-tree** source we just published, not the public copy → the nightly tests unreleased code.
- Everything else (`**`) proxies `npmjs` and caches, so `fastify`, `node-pty`, `pi-coding-agent`, `openspec`, `tsx` resolve normally.

## Decision 3 — Bump the nightly version (full fidelity)

The maintainer chose fidelity. The nightly runs the **same** `sync-versions.js` + lockfile-regen + `verify-lockfile-versions.mjs` sequence the release uses, bumping to `<base>-nightly.<YYYYMMDD>.<sha7>`. This exercises the cross-workspace specifier-coherence machinery that has broken releases before (the `^<base>` vs prerelease-`<base>-…` SemVer gap). Publishing current source unbumped would skip exactly that machinery — rejected.

## Decision 4 — Per-leg Verdaccio, not a shared one

Each of the 6 electron legs runs on its own runner (macOS/Linux/Windows). A shared cross-runner registry is a network + lifecycle liability. Instead **each leg starts its own loopback Verdaccio, publishes the 31 packages, builds, tears down.** 31 local publishes are seconds each; the legs already run in parallel. Fully isolated, no cross-leg coupling.

```
_electron-build.yml  (per leg, when registry_url set)
──────────────────────────────────────────────────────
  start verdaccio (localhost:4873) ── background service
  node scripts/nightly-verdaccio-publish.mjs   # bump→sync→publish 31
  export npm_config_registry=http://localhost:4873
  <existing build steps unchanged>
      └─ bundle-server.mjs `npm install` → Verdaccio  (env flows through)
  node scripts/assert-bundled-plugins-complete.mjs
  <existing runnable-bundle asserts + e2e + qa smoke>
  stop verdaccio
```

## Decision 5 — Zero code change to `bundle-server.mjs`

`bundle-server.mjs` already spawns npm with `env: targetArch ? {...process.env, npm_config_target_arch} : process.env`. Setting `npm_config_registry` in the job env is picked up by npm automatically. The registry override is a **workflow concern**, not a script edit. The `_electron-build.yml` `registry_url` input is the single new surface.

## Decision 6 — Safety invariants locked by a contract test

Mirroring `ci-electron.yml`'s repo-lint guarantees, a test asserts `nightly.yml`:
- contains no `npm publish` without `--registry http://localhost` (public-write ban),
- contains no `softprops/action-gh-release` (no Release),
- contains no `git push` of a tag,
- contains no `git commit` of a version bump.

## Risks

| Risk | Mitigation |
|---|---|
| Verdaccio publish flakiness across 6 legs | per-leg isolation; retry the publish step; `dry-run` pre-gate catches pack errors before any leg spins |
| CI-time blowup (6 × full bundle) | proxy uplink caches third-party; nightly is off the critical path; can trim `legs:` input if needed |
| Nightly rots unwatched (green-forever illusion) | on-failure opens a tracking issue; a nightly that hasn't run in N days is itself an alert (follow-up) |
| Transitive scoped dep missed | publish **all 31** non-private workspaces, not a computed closure — robust by construction |

## Migration / rollout

Additive. New workflow + config + two scripts + one `_electron-build.yml` input. No change to `publish.yml`, `ci-electron.yml` behavior, or `bundle-server.mjs`. Land dark (workflow_dispatch first), watch one manual run green, then enable the `cron`.
