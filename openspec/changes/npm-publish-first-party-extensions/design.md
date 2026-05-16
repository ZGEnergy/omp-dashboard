# Design: npm-publish-first-party-extensions

## Context

`RecommendedExtension.source` carries the install URI that pi's
`DefaultPackageManager` parses to decide how to fetch a package:

| Prefix | Behavior |
|---|---|
| `npm:<name>` | `npm install` into pi's npm cache |
| `https://...git`, `git@...`, `git:...` | `git clone` into `~/.pi/agent/git/<host>/<path>/` |
| absolute / relative path | `pi install -l` local mode |

The Electron offline-bundling pipeline (`bundle-recommended-extensions.mjs`)
operates on git URLs **only**: it shallow-clones, records `.bundled-sha`,
validates SPDX license, and copies the source tree into
`packages/electron/resources/bundled-extensions/<id>/`. At first launch,
`installBundledExtensions` copies that tree into pi's git cache at the
**same path pi would have cloned to** (`~/.pi/agent/git/<host>/<path>/`)
and registers the git URL in `settings.json#packages[]`. This guarantees
pi treats the bundled copy as identical to a freshly-cloned one.

This design assumed `source` was a git URL. After publishing both
first-party extensions to npm, that assumption breaks: a single `source`
field cannot serve both the npm-driven runtime install (now preferred for
Windows-without-git) and the git-driven bundling pipeline.

## Decision

Add an optional `bundleSource?: string` field to `RecommendedExtension`
that decouples the two roles:

- `source` — what pi installs at runtime when the extension is NOT bundled.
  May be `npm:`, git URL, or local path.
- `bundleSource` — git URL used ONLY by `bundle-recommended-extensions.mjs`
  (clone-time) and `installBundledExtensions` (activation-time). Required
  when an id appears in `BUNDLED_EXTENSION_IDS` AND `source` is not a git URL.

`effectiveSource = entry.bundleSource ?? entry.source` is the rule applied
everywhere in the bundling code path. Where `effectiveSource` is the only
correct address (parsing the cache path, registering in `settings.json`),
we use it. Where either form is acceptable for a match (UI active/installed
checks), we accept both.

## Alternatives Considered

1. **Keep `source` as git URL.** Rejected — defeats the point of publishing
   to npm. Windows-without-git users would still be blocked.

2. **Two separate manifest entries per id** (one npm, one git). Rejected —
   id collision in `RECOMMENDED_EXTENSIONS`, breaks the
   `BUNDLED_EXTENSION_IDS ⊂ RECOMMENDED_EXTENSIONS` invariant, and forces
   the UI to dedupe.

3. **Teach the bundling pipeline to pack from npm tarballs.** Possible
   but bigger surface area: `installBundledExtensions` would need to
   change pi's cache layout (npm cache vs. git cache) and the
   `settings.json` source string (`npm:` vs. git URL). Adds asymmetry
   between bundled and non-bundled paths. Deferred — `bundleSource`
   is the minimum surgical change.

4. **Drop bundling for these two extensions.** Considered briefly. The
   Electron installer's value proposition for the standalone-Windows
   audience is "works offline at first launch" — losing bundling for the
   `required` extension regresses that. Rejected.

## Recommended-routes matching rule

`activeInPi` and `installed.scope` formerly compared each candidate active
source to `entry.source`. Now they match if **either** form matches:

```ts
const matchesEntry = (s: string): boolean =>
  sourcesMatch(s, entry.source) ||
  (entry.bundleSource ? sourcesMatch(s, entry.bundleSource) : false);
```

This preserves correctness for the two cases that actually occur in the
wild:

- User installed via Electron bundling → `settings.json` carries the git
  URL → matches `bundleSource`.
- User installed via `pi install npm:@blackbelt-technology/...` (new path) →
  `settings.json` carries the npm spec → matches `source`.

Metadata fetch (description / version for the UI) is npm-first, with a
GitHub-via-`bundleSource` fallback so the UI's "Recommended" tab still
renders nicely if npm is briefly unreachable.

## Compatibility

- Existing users with git-URL entries already in `settings.json` continue
  to work; their "installed" state remains visible.
- The legacy single-field reader in `bundle-recommended-extensions.mjs`'s
  "non-git source" rejection now points at `effectiveSource`, so any
  manifest entry that gets bundled MUST resolve to a git URL through the
  fallback chain. A missing `bundleSource` on an `npm:`-sourced bundled
  id fails fast at build time with an explicit error.
