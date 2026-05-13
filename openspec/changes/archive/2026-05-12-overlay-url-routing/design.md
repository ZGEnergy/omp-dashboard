# Design: overlay-url-routing

## Context

Currently `App.tsx` mixes URL-routed views (Settings, Tunnel, Session, Folder, Terminal) with `useState`-driven overlays (OpenSpec preview, archive browser, specs browser, readme, pi-resources, pi-resource file, file diff). The state-driven overlays do not appear in browser history, which is the root cause of:

> **Scope note.** Three additional overlays — Flow YAML preview, Flow agent detail, Flow architect detail — are owned by `flows-plugin` via `content-view` slot claims (predicate-driven, not URL-driven). They are explicitly OUT OF SCOPE for this change; see proposal §6 for the follow-up plan. All references below to "every overlay" mean every *shell-owned* overlay.


- Back button returning to `/` instead of the previously-displayed view
- No deep-linking, no shareable URLs, no refresh resilience for overlays
- Three different back-button mechanisms (priority chain, mutate-then-navigate, plain history-back) coexisting

The previously-archived `fix-desktop-back-navigation` patched the symptoms (priority-chain helper, auto-close-Settings hack). This proposal addresses the root cause: lift every full-screen view into a wouter route.

## Goals

1. Every full-content-area view has a URL.
2. Browser history is the single source of truth for "what is on screen."
3. Back button works the same way everywhere: `window.history.back()` with cold-load fallback to `navigate("/")`.
4. Sidebar interactions push onto history, not replace.
5. Cold-load / hard-refresh / shareable links work for all routes.
6. Net code reduction: delete the helper, hook, parity test, and auto-close plumbing introduced by the previous change.

## Non-Goals

- Routing modal dialogs (pin, flow picker, extension picker) — they remain in-component state.
- Settings sub-tab routing (`?tab=...`) — listed as optional sub-scope; can be deferred.
- Server-side route handling — SPA fallback already serves `index.html` for any unmatched path.
- Changing how data is fetched. Each overlay already has an API; URL match just triggers the same fetch.
- Mobile-specific behaviour changes. `getMobileDepth` keeps the same 0/1/2 semantics; only its input changes.

## URL Scheme

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       PROPOSED URL SURFACE                                │
└──────────────────────────────────────────────────────────────────────────┘

  Existing (unchanged)
  ────────────────────
  /                                        Landing page
  /session/:id                             Session detail (ChatView)
  /settings                                Settings panel
  /tunnel-setup                            Zrok install guide
  /folder/:encodedCwd/terminals            Folder terminals view
  /folder/:encodedCwd/editor               Folder editor view
  /terminal/:id                            Legacy single-terminal route

  New (folder-scoped overlays)
  ────────────────────────────
  /folder/:encodedCwd/openspec/:changeName/:artifactId
                                           OpenSpec proposal preview
  /folder/:encodedCwd/openspec/archive     OpenSpec archive browser
  /folder/:encodedCwd/openspec/specs       OpenSpec specs browser
  /folder/:encodedCwd/readme               README preview
  /folder/:encodedCwd/pi-resources         Pi resources index

  New (session-scoped overlays)
  ─────────────────────────────
  /session/:id/diff                        File diff view

  (Flow YAML / flow agent / architect overlays are plugin-owned and OUT OF SCOPE; see proposal §6.)

  New (cross-folder overlays)
  ───────────────────────────
  /pi-resource?path=<urlencoded>&title=<urlencoded>
                                           Pi resource file preview
                                           (path is absolute filesystem path,
                                            may be outside any pinned folder)
```

`:encodedCwd` is base64url-encoded via the existing `encodeFolderPath()` helper. `:changeName` and `:artifactId` are kebab-case slugs that are already URL-safe (validated by the existing OpenSpec pipeline).

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                     BEFORE (state-driven)                          │
└────────────────────────────────────────────────────────────────────┘

   Sidebar click                              Render
   ─────────────                              ──────
   onReadArtifact(...)                       previewState ?
        │                                       <OpenSpecPreview .../>
        ▼                                       : null
   setPreviewState({cwd, change, ...})           ▲
        │                                        │
        ▼                                        │
   React state mutation  ────────────────────────┘
                                                  Back button:
                                                   setPreviewState(null) ← clears state
                                                   navigate("/")           ← URL hop


┌────────────────────────────────────────────────────────────────────┐
│                     AFTER (URL-driven)                             │
└────────────────────────────────────────────────────────────────────┘

   Sidebar click                              Render
   ─────────────                              ──────
   onReadArtifact(cwd, change, art)         useRoute("/folder/:c/openspec/:n/:a")
        │                                            │
        ▼                                            ▼
   navigate(buildOpenSpecPreviewUrl(...))     match ? <OpenSpecPreview
        │                                                cwd={decodeFolderPath(p.c)}
        ▼                                                changeName={p.n}
   wouter pushes URL on history stack                    artifactId={p.a}
        │                                                / > : null
        ▼
   useRoute fires → match flips to true
                                                  Back button:
                                                   window.history.back() ← URL pops
                                                   - lands on prior URL
                                                   - if /settings was prior → returns there
                                                   - if cold-load → fallback navigate("/")
```

## Decisions

### D1: Path-style URLs over query strings

Existing convention (`/folder/:encodedCwd/terminals`) is path-style. Continuing it makes URLs recognisable, link-shareable, and inspectable in browser DevTools. Query strings were considered for the OpenSpec preview triple (`cwd`, `change`, `artifact`) — rejected because path-style nests cleanly under `/folder/:encodedCwd/openspec/...`, mirroring the existing folder routes.

**Exception**: `/pi-resource?path=...&title=...` uses query strings because the resource path is an absolute filesystem path that may live outside any pinned folder (e.g. `~/.pi/agent/.../skill.md` outside the workspace). Encoding it as a path segment would be awkward.

### D2: ~~flowYamlPreview is URL-routed but content is best-effort~~ — RESCINDED

Originally this decision argued the Flow YAML overlay would be URL-routed with a placeholder fallback. After verification with subagents (see proposal §6 "Verified state of the world"), this overlay turned out to be owned by `flows-plugin` via a `content-view` claim selected by predicate, not by URL. Wiring it to a URL requires a plugin-runtime change that is out of scope here.

**Outcome:** the route `/session/:id/flow-yaml` is NOT added by this change. The flow YAML overlay continues to be opened via the plugin's existing `FlowsUiState.flowYamlPreview` setter until a follow-up change migrates it.

### D3: Sidebar opens push, never replace

Wouter's `navigate(url)` defaults to push semantics, which is what we want. Explicitly: every callsite that was `setXxx({...})` becomes `navigate(buildXxxUrl(...))`. None use `navigate(url, { replace: true })` unless we explicitly need to (e.g. redirect on invalid URL).

### D4: Fallback on invalid URL

`/folder/:encodedCwd/openspec/:nonexistent-change/:artifact` — what happens? Two options:
- Render an error component with a back button.
- Redirect to `/folder/:encodedCwd` (which doesn't exist as a route — would 404 to `/`).

**Decision: render a "Not found" inline component with a back button**, mirroring how the existing `/session/:unknown-id` route handles unknown sessions (renders ChatView with empty state, then redirects to `/` after WS settle). Same pattern, applied at the overlay level.

### D5: getMobileDepth input change

```ts
// Before
interface MobileDepthInput {
  selectedId?: string;
  selectedTerminalId?: string;
  folderTermCwd?: string | null;
  folderEditorCwd?: string | null;
  settingsMatch?: boolean;
  tunnelSetupMatch?: boolean;
  hasPreview?: boolean;  // ← one bool flattening N overlays
}

// After
interface MobileDepthInput {
  hasSessionRoute: boolean;          // /session/:id (any subroute)
  hasFolderRoute: boolean;           // /folder/:cwd/* (any subroute)
  hasTerminalRoute: boolean;         // /terminal/:id
  hasSettingsRoute: boolean;         // /settings
  hasTunnelRoute: boolean;           // /tunnel-setup
  hasOverlayRoute: boolean;          // any of the 6 new shell-owned overlay routes
  hasPiResourceRoute: boolean;       // /pi-resource (cross-folder)
}
```

Derivation (in `App.tsx`):
```ts
const [openspecPreviewMatch] = useRoute("/folder/:encodedCwd/openspec/:changeName/:artifactId");
const [archiveMatch] = useRoute("/folder/:encodedCwd/openspec/archive");
// ... 6 useRoute calls total for shell-owned overlays
const hasOverlayRoute = openspecPreviewMatch || archiveMatch || ...;
```

The depth output (`0` = list, `1` = detail, `2` = preview-on-detail) stays the same; only the inputs change. Plugin-owned overlay state (`FlowsUiState`) is not consulted here — plugin overlays remain in the `predicate`-driven path until the follow-up change.

### D6: Mobile back arrow simplifies to a single line

```ts
// Before (App.tsx:1370–1390)
onBack={() => {
  if (archiveBrowserCwd) setArchiveBrowserCwd(null);
  else if (specsBrowserCwd) setSpecsBrowserCwd(null);
  else if (flowYamlPreview) setFlowYamlPreview(null);
  // ... 5 more arms
  else navigate("/");
}}

// After
onBack={() => {
  if (window.history.length > 1) window.history.back();
  else navigate("/");
}}
```

Same on desktop. `useDesktopBack` and `selectDesktopBackTarget` are deleted.

### D7: Route builders module

New file `packages/client/src/lib/route-builders.ts`:

```ts
export function buildOpenSpecPreviewUrl(cwd: string, changeName: string, artifactId: string): string {
  return `/folder/${encodeFolderPath(cwd)}/openspec/${encodeURIComponent(changeName)}/${encodeURIComponent(artifactId)}`;
}
// ... one per new route
```

Centralises URL construction. Single point of failure for typos. Unit-testable.

### D8: Optional follow-up — Settings sub-tabs

Settings has 8 sub-tabs (`general`, `pi-ecosystem`, `network`, `themes`, `appearance`, `editors`, `security`, `advanced`). Today they live in `useState` inside `SettingsPanel`. Routing them via `?tab=...` is a small, separable improvement with the same back-button benefit (tab clicks become history entries). **Listed as optional sub-scope** in tasks; can be deferred without blocking the main change.

## Routing Implementation

`App.tsx` becomes a route-driven dispatcher:

```tsx
function App() {
  // Existing routes
  const [, navigate] = useLocation();
  const [sessionMatch, sessionParams] = useRoute("/session/:id");
  const [settingsMatch] = useRoute("/settings");
  // ... etc

  // New overlay routes (folder-scoped)
  const [openspecPreviewMatch, opp] = useRoute("/folder/:encodedCwd/openspec/:changeName/:artifactId");
  const [archiveMatch, am] = useRoute("/folder/:encodedCwd/openspec/archive");
  const [specsMatch, sm] = useRoute("/folder/:encodedCwd/openspec/specs");
  const [readmeMatch, rm] = useRoute("/folder/:encodedCwd/readme");
  const [piResourcesMatch, prm] = useRoute("/folder/:encodedCwd/pi-resources");

  // Session-scoped overlays (shell-owned)
  const [diffMatch, dm] = useRoute("/session/:id/diff");
  // (Flow YAML / agent / architect routes are NOT added — see D2 RESCINDED.)

  // Cross-folder
  const [piResourceFileMatch] = useRoute("/pi-resource");
  const piResourcePath = useSearchParam("path");
  const piResourceTitle = useSearchParam("title");

  // Render
  return openspecPreviewMatch ? <OpenSpecPreview cwd={decodeFolderPath(opp!.encodedCwd)!} changeName={opp!.changeName} initialArtifact={opp!.artifactId} /> :
         archiveMatch         ? <ArchiveBrowserView cwd={decodeFolderPath(am!.encodedCwd)!} /> :
         /* ... etc, falls through to landing page */ <LandingPage />;
}
```

Wouter does NOT have a built-in `useSearchParam` hook (in v3+ it does). For older versions, parse `window.location.search` with a small helper.

Each overlay component drops its `onBack` prop (or accepts an optional one); back is universally `window.history.back()` from the page chrome.

## Test Plan

| Test | What it asserts |
|------|-----------------|
| `route-builders.test.ts` | Each builder produces correct URL; round-trips through `decodeFolderPath`; handles special chars in `changeName`/`artifactId`/`agentName`. |
| Per-route render test | Direct navigation to the URL renders the right component with right props. (6 tests, one per new shell-owned overlay route.) |
| Per-route refresh test | Mount component fresh at the URL, with no prior state, and verify it fetches and renders correctly. (6 tests.) |
| Back-from-overlay regression | The user's repro: navigate to `/settings`, sidebar-click an OpenSpec artifact, click back → URL is `/settings`, Settings is rendered. |
| Cold-load `/session/:id` back | Mount at `/session/:id` with `history.length === 1`, click back, lands on `/`. (Same as fix-desktop-back-navigation Bug 2; this proposal preserves the cold-load fallback.) |
| Mobile depth derivation | `getMobileDepth({ hasSessionRoute: true, hasOverlayRoute: false, ... })` returns 1; with `hasOverlayRoute: true`, returns 2. |
| Removed code is gone | grep tests confirming `selectDesktopBackTarget`, `useDesktopBack`, `clearAllContentViews`, `clearAppContentViews`, and "auto-close before open" plumbing are absent. |

## Risks

| Risk | Mitigation |
|------|------------|
| Refresh on `/folder/:encodedCwd/openspec/:changeName/:artifactId` while WS-driven `openspecMap` is empty | Component shows loading spinner; populates once WS settles. If still missing after settle, render "Not found." Same pattern as session detail today. |
| Bookmarks to `/folder/:encodedCwd/...` after the folder is unpinned | Component renders "Folder not pinned" with a back button and a link to pin. |
| `decodeFolderPath` returns `null` for malformed encodedCwd | Render "Invalid path" + back button. |
| Wouter `useSearchParam` not available in current version | Verify version; if absent, write a 5-line helper using `useEffect` + `window.location.search` + a popstate listener. |
| Plugin slot routes (e.g. `command-route` slot) might collide with new overlay routes | Audit `packages/dashboard-plugin-runtime`'s `command-route` slot: it routes `/cmd/:command` paths, which don't overlap with folder/session-scoped overlays. No collision risk. |
| Settings sub-tabs left as state for now (deferred) | Documented as optional sub-scope; can be added in a follow-up without breaking the main change. |
| Some tests may rely on overlay state directly via `getByTestId` and breaking changes | Migrate any direct state-poking tests to URL-based navigation in the same PR. |

## Migration Steps

1. Add `route-builders.ts` and unit tests.
2. Add new `useRoute` calls in `App.tsx` (no behaviour change yet — both state and route paths render the same overlays).
3. One shell-owned overlay at a time: replace `setXxx({...})` callsites with `navigate(buildXxxUrl(...))`; confirm tests pass; delete the corresponding `useState` once all callsites migrated. (6 overlays: openspec preview, archive, specs, readme, pi-resources, pi-resource file, file diff.)
4. After all 6 shell-owned overlays migrated: delete `desktop-back.ts`, `useDesktopBack.ts`, parity test.
5. Drop `navigate`/`settingsMatch`/`tunnelSetupMatch` deps from `useOpenSpecActions` / `useContentViews`.
6. Simplify mobile and desktop back arrows to `history.back() || navigate("/")`.
7. Update `getMobileDepth` input type.
8. Add the regression test for the user's repro (Settings → artifact → back → Settings).
9. Update spec deltas.
10. Update AGENTS.md and docs/architecture.md.
11. Add "Superseded by overlay-url-routing" note to archived `fix-desktop-back-navigation` proposal.

Order matters: do step 2 before 3 so each migrated overlay can be sanity-checked while other overlays still work via the old state path.

## Out of Scope

- Server-side / SPA fallback changes (already work).
- Modal/dialog routing (pin, flow picker, extension picker — see proposal §2).
- Cross-cutting auth-gate / route-guard logic (no overlay needs auth differently from its parent).
- WebSocket subscription changes (URL match doesn't change which sessions/folders are subscribed to).
- Plugin slot routes (no overlap).
- Performance optimisation (URL switching is O(1); component mount cost unchanged).
