# overlay-url-routing

## Why

The dashboard has eleven full-content-area "windows" but only six of them have URLs. The other five live in `App.tsx` `useState`, invisible to the browser's history stack. Consequence:

1. **Back from a sidebar-opened overlay does not return to where you came from.** If you are on `/settings`, click a sidebar P/D/T/S artifact, then click back, you land on `/` — not on `/settings`. The previously-archived `fix-desktop-back-navigation` change patched this with an "auto-close Settings before opening overlay" hack, which means the back arrow lands on `/` *intentionally*, but the user expected to return to Settings.
2. **No deep-linking, no shareable URLs.** Refreshing while reading a proposal artifact loses your position. You cannot send a teammate a link to "the proposal artifact for change X in repo Y."
3. **Three different back-button mechanisms.** URL-routed views use `navigate("/")`. Overlay views use `setXxx(null)`. The session header uses a custom priority chain (`useDesktopBack`). Mobile uses a separate inline switch (`App.tsx:1370–1390`). Drift between them is the original source of every navigation bug.
4. **Browser back / forward / open-in-new-tab / bookmarks do not work** for overlays.

The right fix is to lift every full-screen view into a wouter route. Browser history becomes the single source of truth for "what is on screen," and `window.history.back()` Just Works because the URL stack reflects the actual user journey — including transitions between Settings, sessions, and overlays.

This proposal supersedes the navigation portion of `fix-desktop-back-navigation` (now archived at `2026-04-30-fix-desktop-back-navigation`). The pure helper, hook, parity test, and "auto-close URL view before opening overlay" plumbing all become unnecessary and are removed by this change.

## What Changes

### 1. URL surface — every full-screen view gets a route

Complete inventory of every "window" and the URL it gets:

| View | Component | Today | Proposed URL |
|------|-----------|-------|--------------|
| Landing page | `LandingPage` | `/` | `/` (unchanged) |
| Session detail | `ChatView` + `SessionHeader` | `/session/:id` | `/session/:id` (unchanged) |
| Settings | `SettingsPanel` | `/settings` | `/settings` (unchanged) |
| Tunnel install guide | `ZrokInstallGuide` | `/tunnel-setup` | `/tunnel-setup` (unchanged) |
| Folder terminals | `TerminalsView` | `/folder/:encodedCwd/terminals` | `/folder/:encodedCwd/terminals` (unchanged) |
| Folder editor | `EditorView` | `/folder/:encodedCwd/editor` | `/folder/:encodedCwd/editor` (unchanged) |
| Legacy single terminal | `TerminalView` | `/terminal/:id` | `/terminal/:id` (kept, deprecated) |
| **OpenSpec proposal preview** | `OpenSpecPreview` | `previewState` (state) | `/folder/:encodedCwd/openspec/:changeName/:artifactId` |
| **OpenSpec archive browser** | `ArchiveBrowserView` | `archiveBrowserCwd` (state) | `/folder/:encodedCwd/openspec/archive` |
| **OpenSpec specs browser** | `SpecsBrowserView` | `specsBrowserCwd` (state) | `/folder/:encodedCwd/openspec/specs` |
| **README preview** | `MarkdownPreviewView` | `readmePreview` (state) | `/folder/:encodedCwd/readme` |
| **Pi resources index** | `PiResourcesView` | `piResourcesState` (state) | `/folder/:encodedCwd/pi-resources` |
| **Pi resource file preview** | `MarkdownPreviewView` | `piResourceFilePreview` (state) | `/pi-resource?path=<urlencoded>&title=<urlencoded>` |
| **Session file diff view** | `FileDiffView` | `diffViewSessionId` (state) | `/session/:id/diff` |
| ~~Flow YAML preview~~ | `MarkdownPreviewView` | `flowYamlPreview` (state) | **OUT OF SCOPE — plugin-owned, see §6** |
| ~~Flow agent detail~~ | `FlowAgentDetail` | `flowDetailAgent` (state) | **OUT OF SCOPE — plugin-owned, see §6** |
| ~~Flow architect detail~~ | `FlowArchitectDetail` | `architectDetailOpen` (state) | **OUT OF SCOPE — plugin-owned, see §6** |

`encodedCwd` uses the existing `encodeFolderPath` / `decodeFolderPath` helpers (`packages/client/src/lib/folder-encoding.ts`).

### 2. Modals and dialogs — NOT URL-routed

The following remain in-component state because they are ephemeral, modal, or sub-component concerns. URL-routing them would add noise without value:

- `pinDialogOpen` — pin directory dialog (transient)
- `flowPickerOpen`, `flowNewOpen`, `flowEditPickerOpen`, `flowDeletePickerOpen` — flow management dialogs
- `flowEditFlowName`, `flowDeleteFlowName`, `flowLaunchTarget` — flow dialog sub-state
- `extensionModulePickerOpen`, `extensionModuleOpen` — extension UI modals
- `mobileOpen` — mobile sidebar overlay
- `architectDetailOpen` — *was* in the URL-routed list above, see §3
- `sourceOpenAgent` — toggle inside FlowDashboard, not a full takeover

Settings-page sub-tabs (`general`, `pi-ecosystem`, `network`, etc.) become query params: `/settings?tab=pi-ecosystem`. (Optional sub-scope; can be deferred without blocking the main change.)

### 3. Decisions baked in

- **Path style over query string.** Consistent with existing `/folder/:encodedCwd/...` convention. Cleaner, more shareable. Only `pi-resource` uses query because its `path` is an absolute filesystem path that may live outside any pinned folder.
- **`flowYamlPreview` is URL-routed but content is best-effort.** The YAML is computed from `state.architectState.flowYamlContent` or fetched from `flowSource`. On cold load, if the session is not yet loaded or has no YAML state, the route renders a "Flow YAML not available — return to session" placeholder. Acceptable tradeoff — overrides on this overlay are rare and the URL still gives users a back-button-friendly anchor.
- **`flowDetailAgent`, `architectDetailOpen`, and `flowYamlPreview` are explicitly OUT OF SCOPE.** These are not owned by the shell — they are rendered by `flows-plugin`'s `content-view` slot claims (`FlowAgentDetailClaim`, `FlowArchitectDetailClaim`, `FlowYamlPreviewClaim` in `packages/flows-plugin/src/client/`), selected by predicates that read from a module-level `useSyncExternalStore` (`FlowsUiStateContext`, scoped per dashboard mount, not per session). The shell's `<ContentViewSlot>` consumer (`packages/dashboard-plugin-runtime/src/slot-consumers.tsx:203–228`) filters claims by `predicate(session)` and renders the highest-priority match; URL is not consulted. Note: the slot's prop contract (`SlotPropsMap["content-view"]`) *already* declares `routeParams: Record<string, string>` and `onClose: () => void`, but the shell currently passes `routeParams={{}}` and `onClose={() => navigate("/")}` (`App.tsx:1385`), and all three flow claims explicitly ignore `routeParams` (comments in each claim: "part of the slot contract but unused"). Wiring these to real URLs is therefore a *plugin-runtime + plugin* change — out of scope here, deferred to §6.
- **Overlays become mutually exclusive.** Today, `previewState` and `flowYamlPreview` could be set simultaneously (the JSX priority chain at App.tsx:884–895 picks the higher-priority one to render). With URL-routed overlays, only one route matches at a time. This matches what users perceive anyway and removes the priority chain and its parity test entirely.
- **Mobile uses the same routes.** `getMobileDepth` is rewritten to derive depth from `useRoute` matches instead of state flags — no logic change, just a different input source.

### 4. Code that is DELETED by this change

The previously-archived `fix-desktop-back-navigation` introduced:
- `packages/client/src/lib/desktop-back.ts` (pure helper + 256-combination parity test)
- `packages/client/src/hooks/useDesktopBack.ts` (priority-chain dispatcher)
- `navigate` / `settingsMatch` / `tunnelSetupMatch` plumbing through `useOpenSpecActions` and `useContentViews` to auto-close URL views before opening overlays

All of it becomes obsolete. The session-header back button reduces to:

```ts
onBack={() => {
  if (window.history.length > 1) window.history.back();
  else navigate("/");
}}
```

This single fallback behaviour replaces the helper, hook, priority chain, parity test, and auto-close hack. The mobile inline switch (`App.tsx:1370–1390`) collapses to the same two-line check.

### 5. Bonus: deep-link refresh resilience

Each new route handles cold-load gracefully:

- `/folder/:encodedCwd/openspec/:changeName/:artifactId` — `OpenSpecPreview` reads `openspecMap[cwd]` from the WS replay; if missing, renders a loading spinner; if cwd has no such change after WS settles, redirects to `/`.
- `/folder/:encodedCwd/readme` — fetches via existing `/api/readme?cwd=` (already cwd-driven).
- `/folder/:encodedCwd/pi-resources` — fetches via existing pi-resources API.
- `/pi-resource?path=...` — fetches via existing `/api/pi-resource-file`.
- `/session/:id/diff` — fetches via existing `/api/session-diff`.


## §6 Follow-up: plugin route claims (out of scope, separate change)

### Verified state of the world (do not assume)

- The slot prop contract for `content-view` *already* declares `routeParams: Record<string, string>` and `onClose: () => void` (`packages/shared/src/dashboard-plugin/slot-props.ts:49–53`). No type-level change is needed to start passing route data into claims.
- The shell currently passes `routeParams={{}}` and `onClose={() => navigate("/")}` at exactly one site: `App.tsx:1385`. There is no URL-aware path through `ContentViewSlot` today.
- `<ContentViewSlot>` is *not* mounted inside any wouter `<Route>`. It is rendered inside `sessionDetail` and gated on `selectedId && selectedSession && forSession(claims, session).length > 0` (`App.tsx:1385`). Selection is by claim `predicate(session)`, tie-broken by `priority` then `pluginId.localeCompare` (`packages/dashboard-plugin-runtime/src/slot-registry.ts:87–91`).
- `flows-plugin`'s three claim predicates ignore the session arg entirely and read from a module-level `useSyncExternalStore` (`FlowsUiStateContext`) per dashboard mount (`packages/flows-plugin/src/client/index.tsx:78–86`; comment at `FlowsUiStateContext.tsx:10–12` confirms "NOT per session"). Setters: `setFlowDetailAgent` (4 callsites), `setArchitectDetailOpen` (2 callsites), `setFlowYamlPreview` (1 callsite).
- `onBack` inside each claim today calls a plugin setter THEN `onClose()` (e.g. `FlowAgentDetail.tsx:205–208`: `() => { actions.setFlowDetailAgent(null); onClose(); }`). Because shell `onClose = navigate("/")`, hitting back from a plugin overlay returns the user to the landing page, not the previous session view — this is the bug the user observed.
- `CommandRouteSlot` consumer exists (`slot-consumers.tsx:289–310`) but is **dead code**: nothing in `packages/client/src/` invokes `<CommandRouteSlot>`. The `flows-plugin` registers four `command-route` claims (`plugin-registry.tsx:92–95`) that no consumer renders. Manifest validator enforces uniqueness on `claim.command` (`manifest-validator.ts:101–107`); no `path` field exists on `PluginClaim` today.
- `IntentRenderer` (`packages/dashboard-plugin-runtime/src/intent-renderer.tsx`) is purely a tree walker resolving `primitive` names via `useUiPrimitive`. It contains zero URL/route/history code (grep confirmed). Server-side plugins broadcast via `broadcastToSubscribers({type:"plugin_intents",...})` (`server-context.ts:50–87`); there is no `URL→re-emit-intent` path on the server. IntentRenderer is therefore orthogonal to URL routing and unchanged by any follow-up.

### What the follow-up would need to do

The minimum coherent change that lets `flows-plugin` agent/architect/YAML overlays participate in the URL (so browser back returns to `/session/:id`):

1. **Shell** wraps the `<ContentViewSlot>` mount site in a wouter route catch-all that derives `routeParams` from the path (e.g. `/session/:id/x/:rest*`) and passes a real `onClose = () => window.history.length > 1 ? window.history.back() : navigate("/session/:id")`. No slot-types change required — the prop contract already supports this.
2. **Plugin claim selection** gains a URL-driven mode. Two viable shapes (decision deferred):
   - **(a) URL-aware predicate.** Pass `routeParams` as a second arg to predicates: `predicate(session, routeParams)`. Plugins read `routeParams.agentName` instead of `getFlowsUiStateSnapshot().flowDetailAgent`. The `FlowsUiStateContext` setters become navigation calls (`navigate(´/session/${id}/flow/${name}´)`); the store is retired or kept only as a write-through cache. Smallest blast radius; requires changing `SlotPredicate<S>` signature in `slot-registry.ts` and updating every existing predicate callsite.
   - **(b) New `content-route` claim shape.** Add `path?: string` to `PluginClaim` (`manifest-types.ts`) and validate URL-pattern uniqueness in `manifest-validator.ts`. `ContentViewSlot` first tries route-matched claims (wouter pattern match), falls back to predicate claims. Bigger change but cleaner contract; plugins opt in incrementally.
3. **Plugin** (`flows-plugin`) drops `isFlowAgentDetailActive` / `isFlowArchitectDetailActive` / `isFlowYamlPreviewActive` predicates (or converts them to read `routeParams`), changes the four call sites of `setFlowDetailAgent` to `navigate(buildFlowAgentUrl(...))`, the two `setArchitectDetailOpen(true)` calls to `navigate(buildArchitectUrl(...))`, and the one `setFlowYamlPreview({content,title})` call to `navigate(buildFlowYamlUrl(...))`. `FlowYamlPreview`'s computed `content`/`title` survive only via re-derivation on mount — same cold-load tradeoff as the shell's `/session/:id/flow-yaml` would have had.
4. **Dead code cleanup** (optional but adjacent): either wire `<CommandRouteSlot>` into the input handler, or delete it and the four `flows-plugin` command-route claims.

None of this is required for `overlay-url-routing` to ship: the shell back-button simplification in §3–§5 already produces the right behaviour *for shell-owned* overlays, and the new normative requirement in `specs/url-routing/spec.md` explicitly excludes plugin claims so the follow-up has a clean spec delta to extend.

## Capabilities

### Modified Capabilities

- `url-routing`: massively expanded. The two `MODIFIED` requirements from the just-archived fix-desktop-back-navigation are themselves modified (back button is no longer a priority-chain dispatcher; it's a plain history-back with cold-load fallback). Eight `ADDED` requirements cover the new routes. The "Sidebar overlays auto-close URL-route views" requirement from fix-desktop-back-navigation is **REMOVED** (no longer applicable — sidebar opens push a new URL on top, browser back returns to the previous URL).

## Impact

### Modified files

- `packages/client/src/App.tsx`:
  - Add 9 new `useRoute(...)` calls (one per new route).
  - Replace overlay state declarations with route-derived values.
  - Convert overlay rendering from `state ? <X/> : null` to `match ? <X cwd={params.cwd} ... /> : null`.
  - Replace every `setPreviewState({...})`, `setReadmePreview(...)`, etc. with `navigate(<route>)`.
  - Replace every `setPreviewState(null)` etc. with `() => window.history.back()` (or remove — overlay's own back button now works naturally).
  - Delete `clearAppContentViews` / `clearAllContentViews` / `clearContentViews` plumbing.
  - Simplify mobile `onBack` switch and desktop session-header `onBack` to single-line `history.back()` + cold-load fallback.
  - Rewrite `getMobileDepth` input shape: takes route-match flags instead of state flags.

- `packages/client/src/hooks/useOpenSpecActions.ts`: drop `navigate`/`settingsMatch`/`tunnelSetupMatch` deps; `handleReadArtifact` no longer mutates state — it calls `navigate(\`/folder/${encodeFolderPath(cwd)}/openspec/${changeName}/${artifactId}\`)`. Or simpler: callers do the navigation themselves; the hook becomes a no-op for that handler (consider removing).

- `packages/client/src/hooks/useContentViews.ts`: same shape — `handleOpenPiResources` / `handleViewPiResourceFile` / `handleViewReadme` become navigation calls. Local `useState` for `piResourcesState` / `piResourceFilePreview` / `readmePreview` is removed; data is derived from route params + API fetch on mount.

- `packages/client/src/lib/mobile-depth.ts`: input interface renamed from state-flags to route-match flags.

### Deleted files

- `packages/client/src/lib/desktop-back.ts`
- `packages/client/src/hooks/useDesktopBack.ts`
- `packages/client/src/lib/__tests__/desktop-back.test.ts` (256-combination parity test)
- `packages/client/src/hooks/__tests__/useDesktopBack.test.tsx` (if present)

### New files

- `packages/client/src/lib/route-builders.ts` — small utility module with one builder per new route (e.g. `buildOpenSpecPreviewUrl(cwd, change, artifact)`). Keeps callsites consistent and refactor-safe.
- `packages/client/src/lib/__tests__/route-builders.test.ts`.

### New tests

- One unit test per route builder (URL escaping, encoded-cwd round-trip, special chars in artifact IDs).
- One integration test per new route confirming:
  - Direct navigation to the URL renders the right component
  - Refresh on the URL renders the right component once data loads
  - Back from the URL returns to the previous URL
  - Sidebar action that opens the overlay pushes onto history (does not replace)
- One regression test for "open Settings → click sidebar artifact → back → return to Settings" (the user's repro).

### Spec deltas

- `openspec/changes/overlay-url-routing/specs/url-routing/spec.md`:
  - MODIFIED: `Back navigation button` (now plain history-back with cold-load fallback)
  - REMOVED: `Sidebar overlays auto-close URL-route views` (no longer applicable)
  - ADDED: 8 new route requirements (one per new route)
  - ADDED: one cross-cutting requirement that opening any content-area view from the sidebar SHALL push onto history (not replace), so back returns to the prior view.

### Migration notes for `fix-desktop-back-navigation` (archived)

Add a "Superseded by" note at the top of `openspec/changes/archive/2026-04-30-fix-desktop-back-navigation/proposal.md` pointing to this change. Archives are otherwise immutable. The supersession is documented inside this proposal's §4.

### Non-impacts

- No protocol/server changes. All new routes are pure client-side.
- No `index.html` / SPA fallback changes. Server already returns `index.html` for unmatched paths.
- No persistence / WebSocket / extension changes.
- No new dependencies. Wouter already supports nested + parameterised routes; everything else (`encodeFolderPath`, fetch APIs) exists.
- No mobile-specific work beyond the `getMobileDepth` rename.
