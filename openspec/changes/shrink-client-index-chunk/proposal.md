## Why

The production client `index` entry chunk is **4.8 MB** — of which **~2.6 MB is the
entire `@mdi/js` icon set** (all ~7000 SVG paths), pulled in eagerly because
`ActionList.tsx` / `StatusPill.tsx` resolve extension-supplied icon keys via a
full-namespace lookup (`import("@mdi/js").then(mdi => mdi[iconKey])`) that defeats
tree-shaking, while 202 other files also import `@mdi/js`. That same namespace access
is the root cause of the `@mdi/js` "dynamic import will not move module into another
chunk" build warning. This change splits the bloat out of the eager entry chunk and
then sets a deliberate, documented `chunkSizeWarningLimit`.

This is the structural follow-up deliberately deferred from `fix-vite-build-warnings`,
which handled only the mechanical, zero-behavior warnings.

## What Changes

- **Split `@mdi/js` into its own manual chunk** — add `@mdi/js` to `manualChunks` in
  `packages/client/vite.config.ts` so the ~2.6 MB of icon paths leaves the eager
  `index` chunk (index ~4.8 → ~2.2 MB) into a separately-cacheable `mdi` chunk. This
  also resolves the `@mdi/js` dynamic+static import warning at its root (single owning
  chunk).
- **Set a deliberate `chunkSizeWarningLimit`** with a documented rationale enumerating
  the intentionally-large chunks (`monaco` ~3.9 MB lazy, `diff` ~1.1 MB lazy, Monaco
  workers, the new `mdi` chunk, and the `markdown` chunk enlarged to ~1.0 MB by
  `fix-vite-build-warnings`) so the oversized-chunk aggregate warning reflects a
  decision rather than noise.

Because the icon keys are open-ended (any extension may request any MDI icon), the
namespace lookup is retained — the win is chunk placement, not tree-shaking.

## Capabilities

### New Capabilities
<!-- none: internal build-tooling / bundle-structure change -->

### Modified Capabilities
- `client-build-config`: add a requirement covering the `@mdi/js` chunk placement
  (icons out of the eager entry chunk) and the deliberate `chunkSizeWarningLimit`.

## Impact

- `packages/client/vite.config.ts` — `manualChunks` (`mdi` entry), `chunkSizeWarningLimit`.
- Depends on / sequences after `fix-vite-build-warnings` (shares `client-build-config`
  and the `markdown` chunk sizing).
- No dependencies added or removed; no runtime behavior change. Verified by before/after
  `dist/assets` chunk sizes and a clean build.

## Note

This proposal is a **scaffold stub** — it still needs its own full planning pass
(`plan-proposal`: doubt-review + `scenario-design` → `test-plan.md` → fold) before it
reaches the worktree boundary. It exists now so `fix-vite-build-warnings` has a real
deferral owner.
