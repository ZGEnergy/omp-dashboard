## MODIFIED Requirements

### Requirement: Back navigation button
The session header and overlay headers SHALL display a back button. The back action (back button on desktop and mobile, plus the mobile swipe-back gesture) SHALL be **depth-aware**: one back invocation moves exactly one shell depth toward the list, where depth is `getMobileDepth` (0 = list / cards, 1 = detail, 2 = overlay).

Route depth and parent SHALL be resolved from an ordered `RouteDescriptor` table (`{ pattern, depth, computeParent }`), NOT a hardcoded route switch. Resolution SHALL be most-specific-first, first-match-wins. The table SHALL be the union of (a) static descriptors for core routes and (b) descriptors contributed by plugin `shell-overlay-route` claims. `routeDepth(url)` SHALL return the matched descriptor's depth, or 0 when no descriptor matches. A route that resolves to depth 0 is the card list; a route with no matching descriptor SHALL be treated as depth 0.

Modal routes (`/settings`, `/settings/:page`, `/tunnel-setup`) are entered from a launching route and SHALL return to it. The Settings panel and tunnel-setup back affordances SHALL delegate to the shared depth-aware back action; they SHALL NOT hardcode a fixed `/` destination.

The back action SHALL resolve its target as follows:
- When the current route is a modal route AND the app's tracked in-app navigation stack has a predecessor, it SHALL invoke `window.history.back()` so the URL returns to the launching route (regardless of the predecessor's depth).
- It MAY invoke `window.history.back()` as a fast-path ONLY when the app's tracked in-app navigation stack proves the entry it would return to is an in-app route whose depth is strictly shallower than the current depth.
- Otherwise it SHALL navigate explicitly to the computed parent route `computeBackTarget(currentRoute)`, which returns the matched descriptor's `computeParent(...)` result, or the depth default when no `computeParent` is declared:
  - Depth 1 (`/session/:id`, `/folder/:cwd/...`, `/settings`, `/tunnel-setup`, and depth-1 plugin routes) → `/`.
  - Depth 2 `/session/:id/diff` → `/session/:id` (strip the `/diff` segment).
  - Depth 2 overlays whose URL does not encode their launching detail (`/folder/:cwd/openspec/*`, `/folder/:cwd/pi-resources`, `/pi-resource?…`) → `/`.
  - Depth 2 plugin routes with a declared `parentPath` → that parent (params interpolated from the current match).
  - Depth 0 → no-op.

The back action SHALL NEVER land on a sibling route of the same depth that was not the launching route (e.g. an unrelated `/session/:id`) and SHALL NEVER navigate outside the dashboard application. The app SHALL maintain the tracked navigation stack by appending each in-app navigation (tagged with its derived depth), overwriting the stack top on `replace`-style navigations, and realigning on `popstate`.

#### Scenario: Back from chat returns to cards regardless of prior chats
- **GIVEN** the user navigated `/` → `/session/A` → `/session/B` (both depth 1)
- **AND** the viewport is mobile so `/session/B` renders at depth 1
- **WHEN** the user invokes the depth-aware back action
- **THEN** the URL SHALL resolve to `/` (cards), not to `/session/A`

#### Scenario: Core route depth resolves via the descriptor table
- **GIVEN** the descriptor table migrated from the prior hardcoded switch
- **WHEN** `routeDepth` is evaluated for `/session/abc/diff`, `/folder/CWD/settings/instructions`, and `/folder/CWD/openspec/specs`
- **THEN** it SHALL return `2`, `1`, and `2` respectively, matching pre-migration behavior

#### Scenario: Plugin overlay route resolves to a defined depth (no dead no-op)
- **GIVEN** a plugin `shell-overlay-route` claim declaring `path: "/folder/:encodedCwd/automations"` with `depth: 1`
- **WHEN** the user is on `/folder/CWD/automations` and invokes the depth-aware back action
- **THEN** `routeDepth` SHALL return `1` (not `0`)
- **AND** the back action SHALL navigate to `/` rather than early-returning as a no-op

#### Scenario: Plugin overlay route with a declared parent returns to it
- **GIVEN** a plugin claim declaring `path: "/automation/run/:sid"` with `depth: 2` and `parentPath: "/folder/:encodedCwd/automations"`
- **AND** the user opened the run monitor from the board for cwd `/Users/u/proj`
- **WHEN** the user invokes the depth-aware back action
- **THEN** the back action SHALL navigate to `/folder/<encoded /Users/u/proj>/automations`
