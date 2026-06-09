## Why

The overlay-url-routing change made OpenSpec artifact viewing URL-driven on *entry* (clicking a P/D/T/S letter navigates to `/folder/:cwd/openspec/:change/:artifactId`) and *back* (history-driven). But the per-artifact **tab dimension** still lives entirely in component state. Switching tabs inside the preview mutates `useState` only — the URL never moves. This re-introduces exactly the desync the overlay-url-routing proposal set out to eliminate: refresh loses your position, shared links point at the wrong artifact, and browser Back exits the whole preview instead of stepping back through artifacts.

## What Changes

- **Tab click drives the URL.** `OpenSpecPreview`'s `onTabChange` SHALL `navigate(buildOpenSpecPreviewUrl(cwd, change, tabId))` using **push** history, instead of calling `reader.setActiveTab` directly. Each artifact view becomes a discrete, shareable, refresh-safe history entry.
- **URL drives the active tab.** `useOpenSpecReader` SHALL derive `activeTab` from the `initialArtifact` prop on every change (via effect or by treating the prop as the source of truth), not only from the one-time `useState` initializer. When the route's `:artifactId` segment changes while the component stays mounted, the visible content follows.
- **Browser Back/Forward step through artifacts.** Because tab switches push history, Back walks P→D→S in reverse; Forward replays. The existing `goBackOrHome` cold-load fallback is unaffected (push only adds entries, never makes `history.length === 1`).

## Capabilities

### New Capabilities
<!-- none — this is a behavior fix to existing requirements -->

### Modified Capabilities
- `openspec-artifact-reader`: the "Tab navigation between artifacts" requirement changes from internal-state switching to URL-driven switching — clicking a tab updates the URL, and `activeTab` is derived from the URL param.
- `url-routing`: the `/folder/:encodedCwd/openspec/:changeName/:artifactId` route's `:artifactId` segment SHALL stay in sync with the visible tab; tab switches navigate via push history (mirroring the existing "session selection navigates via push" requirement).

## Impact

- `packages/client/src/App.tsx` — `OpenSpecPreview` component: rewire `onTabChange` to navigate instead of `setActiveTab`; thread `navigate` + `cwd` + `changeName` into the handler.
- `packages/client/src/hooks/useOpenSpecReader.ts` — derive `activeTab` from `initialArtifact` (sync effect or drop internal `setActiveTab` ownership); `setActiveTab` return may be removed or repurposed.
- No server, shared-protocol, or extension changes. No new routes or URL builders (reuses `buildOpenSpecPreviewUrl`).
- Archive preview path (`archive` reader) shares the same hook — behavior applies uniformly, but the Specs/Archive *browser* routes (whole-folder views) are out of scope; they have no P/D/S tab model.
