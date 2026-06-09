## Context

After the overlay-url-routing change, OpenSpec artifact entry is URL-driven and Back is history-driven, but the active-tab dimension is not. The wiring today:

- **Entry (URL-driven ✓):** `FolderOpenSpecSection` letter click → `useOpenSpecActions.handleReadArtifact` → `navigate(buildOpenSpecPreviewUrl(cwd, change, artifactId))` → wouter matches `/folder/:encodedCwd/openspec/:changeName/:artifactId` in `App.tsx` → renders `<OpenSpecPreview initialArtifact={artifactId}>`.
- **Tab switch (NOT URL-driven ✗):** `MarkdownPreviewView` tab button → `onTabChange(id)` → `reader.setActiveTab(id)` → internal `useState` only. No `navigate()`, no history entry.
- **Active tab seed (one-time ✗):** `useOpenSpecReader` does `const [activeTab, setActiveTab] = useState(initialArtifact)`. The initializer runs once; there is no effect syncing later `initialArtifact` prop changes back into `activeTab`.
- **Back (history-driven ✓):** `goBack` → `goBackOrHome(navigate)` → `window.history.back()`, with `navigate("/")` fallback when `history.length === 1`.

Two concrete bugs result:
- **Bug 1 — tab → URL not wired.** Switching Proposal→Design leaves the URL at `.../proposal`. Refresh reloads Proposal; shared links point at the wrong artifact; Back exits the whole preview (no history entry was pushed).
- **Bug 2 — URL → tab not wired.** Clicking a different artifact letter for the *same* change re-navigates the route params but `<OpenSpecPreview>` stays mounted, so `activeTab` is stuck on the original value. URL says `design`, screen shows `proposal`.

Constraint: keep the URL the single source of truth for *which artifact* within a change, mirroring how it is already the source of truth for *which change*.

## Goals / Non-Goals

**Goals:**
- Tab switches update the URL `:artifactId` segment (push history), making every artifact view shareable and refresh-safe.
- `activeTab` derives from the URL (`initialArtifact` prop), so route-param changes on a mounted preview update the visible content.
- Browser Back/Forward step through artifacts (P→D→S) the same way they step through sessions.
- No regression to the `goBackOrHome` cold-load fallback.

**Non-Goals:**
- No changes to the Specs browser (`/openspec/specs`) or Archive browser (`/openspec/archive`) — whole-folder views with no per-change tab model.
- No new routes, URL builders, or server/shared/extension changes.
- No change to how artifact *content* is fetched (`fetchArtifactContent` stays as-is).

## Decisions

### Decision 1: Tab switch uses push history (not replace)

`onTabChange` calls `navigate(buildOpenSpecPreviewUrl(cwd, changeName, tabId))` with wouter's default **push**.

- **Why push over replace:** Maximizes the proposal's shareability goal — every artifact view is a discrete history entry. Matches the existing `url-routing` precedent ("Session selection navigates via push"). Back walks P→D→S, matching browser convention that Back undoes the most recent action.
- **Alternative considered — replace:** Back would exit the preview in one step and the URL would still be shareable/refresh-safe, but it collapses the artifact undo chain and diverges from the session-selection precedent. Rejected.
- **Cold-load interaction:** push only *adds* history entries, so it never drives `history.length` down to 1 — the `goBackOrHome` fallback (`navigate("/")` when `length === 1`) is never spuriously triggered by tab switching.

### Decision 2: `activeTab` is derived from `initialArtifact`, not owned by the hook

The URL is the single source of truth. Two viable implementations:

- **(A) Drop internal state:** `useOpenSpecReader` stops owning `activeTab` — it consumes `initialArtifact` directly as the active tab and the content-loading effect keys on `initialArtifact`. `setActiveTab` is removed from the returned API; `onTabChange` navigates instead.
- **(B) Sync effect:** Keep `useState(initialArtifact)` but add `useEffect(() => setActiveTab(initialArtifact), [initialArtifact])` to re-sync on prop change.

**Chosen: (A).** It removes the dual-source-of-truth entirely (no state that can drift from the URL), is simpler, and eliminates the redundant `setActiveTab` round-trip. The content-load effect already keys on the active artifact; pointing it at `initialArtifact` is a one-line change. `MarkdownPreviewView`'s `activeTab` prop is fed `initialArtifact`.

- **Why not (B):** Keeps a second source of truth that exists only to be overwritten by the effect — strictly more state for no benefit. The effect also briefly renders the stale tab before the sync fires.

### Decision 3: Thread `navigate`, `cwd`, `changeName` into `OpenSpecPreview`

`OpenSpecPreview` already receives `cwd` and `changeName` as props. It needs `navigate` (wouter `useLocation`/`navigate`) to build the tab-change handler: `onTabChange={(tabId) => navigate(buildOpenSpecPreviewUrl(cwd, changeName, tabId))}`. `buildOpenSpecPreviewUrl` is already imported in `App.tsx`.

## Risks / Trade-offs

- **History noise from rapid tab-switching** → Acceptable and intended: each artifact view is a real navigation. Users wanting no history churn use the tab UI rather than Back. Matches session-selection behavior.
- **Archive preview shares the hook** → The same reader serves archived changes (`archive` flag). Deriving `activeTab` from `initialArtifact` applies uniformly; the archive route still passes `initialArtifact`, so no special-casing needed. Verify archive preview still tab-switches after the change.
- **Removing `setActiveTab` from the hook API** → If any other caller depends on it, the build breaks. Mitigation: grep for `setActiveTab` consumers before removing; current evidence shows only `OpenSpecPreview` uses it.

## Migration Plan

Pure client refactor, no data/schema migration. Deploy = rebuild client + restart server (`npm run build` → `POST /api/restart`). Rollback = revert the two-file diff. No persisted state or URL-format change (the route already exists), so old shared links remain valid.

## Open Questions

None blocking. Push-vs-replace resolved (push). Implementation strategy resolved (derive, Decision 2A).
