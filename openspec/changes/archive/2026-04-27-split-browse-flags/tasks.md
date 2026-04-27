## 1. Shared types

- [x] 1.1 In `packages/shared/src/rest-api.ts`, make `BrowseEntry.isGit` and `BrowseEntry.isPi` optional (`boolean | undefined`).
- [x] 1.2 Add `BrowseFlagsRequest` (`{ paths: string[] }` shape note in JSDoc — the wire form is the URL query) and `BrowseFlagsResponse` (`ApiResponse<{ flags: Record<string, { isGit: boolean; isPi: boolean }> }>`).
- [x] 1.3 Update the file's top-of-file docstrings so the `/api/browse` paragraph documents the new `detect` parameter and references the bulk endpoint.

## 2. Server: enumeration / classification split

- [x] 2.1 In `packages/server/src/browse.ts`, extract the per-entry `fs.access` probe into a dedicated helper (e.g. `probeFlags(path: string): Promise<{ isGit: boolean; isPi: boolean }>`) that swallows all errors as `{ isGit: false, isPi: false }`.
- [x] 2.2 Make `listDirectories(dirPath?, q?, opts?: { detect?: boolean })` skip the probe loop and omit `isGit` / `isPi` from each `BrowseEntry` when `detect` is not `true`. Preserve today's behavior verbatim when `detect: true`.
- [x] 2.3 Add `classifyPaths(paths: string[]): Promise<Record<string, { isGit: boolean; isPi: boolean }>>` that probes each path through `probeFlags` with bounded concurrency (use `createSemaphore(32)` from `packages/shared/src/semaphore.ts`).
- [x] 2.4 Add input validation helpers: a path-cap constant `MAX_FLAG_PATHS = 100` and a `parseFlagsQuery(rawPaths: string | undefined)` that returns either `{ ok: true, paths: string[] }` or `{ ok: false, error: "invalid paths" | "too many paths" }`.

## 3. Server: routes

- [x] 3.1 In `packages/server/src/routes/file-routes.ts`, parse `detect` from the `/api/browse` query string and pass it through to `listDirectories`. Treat anything other than the literal string `"1"` as falsy.
- [x] 3.2 Add `GET /api/browse/flags` to the same file. Use `parseFlagsQuery` for input validation; return HTTP 400 with the documented error strings on failure. On success, call `classifyPaths` and return `{ success: true, data: { flags } }`.
- [x] 3.3 Confirm both endpoints inherit the existing `/api/browse` localhost / trusted-network gate (no new auth wiring required — verify by reading the route registration block).

## 4. Client: PathPicker two-phase fetch

- [x] 4.1 In `packages/client/src/lib/browse-api.ts`, drop reliance on flags being present on the initial `browseDirectory` response (it's still typed-optional, so consumers fall back gracefully). Add a new helper `classifyPaths(paths: string[], opts?: { signal?: AbortSignal }): Promise<Record<string, { isGit: boolean; isPi: boolean }>>` that calls `GET /api/browse/flags`.
- [x] 4.2 In `packages/client/src/components/PathPicker.tsx`, after `setEntries(result.entries)` in `fetchDir`, fire a fire-and-forget `classifyPaths(result.entries.map(e => e.path), { signal: ctrl.signal })`. On resolution, merge the flag map into the rendered entries via `setEntries(prev => prev.map(e => ({ ...e, ...(flagMap[e.path] ?? {}) })))`. Skip phase 2 if `result.entries` is empty.
- [x] 4.3 Ensure phase-2 abort is correctly scoped: when `fetchDir` is called again or unmounts, the in-flight flags request is canceled. Phase-2 errors SHALL be silently swallowed (badges just don't appear) — do NOT surface them via `setError`.

## 5. Tests: server

- [x] 5.1 In `packages/server/src/__tests__/browse-endpoint.test.ts`, replace the two host-coupled `should detect isGit flag …` and `should detect isPi flag …` tests with hermetic tmpdir-based versions that (a) `fs.mkdtemp` a fresh dir, (b) create three sibling subdirs (one with `.git`, one with `.pi`, one plain), (c) call `listDirectories(tmpdir, undefined, { detect: true })`, (d) assert flags on each.
- [x] 5.2 Add a new test: `listDirectories(tmpdir)` (no `detect`) returns entries with `isGit` and `isPi` undefined and performs zero `.git` / `.pi` filesystem accesses (assert via spy on `fs.access` or by counting fs calls).
- [x] 5.3 Add new tests for `classifyPaths`: (a) mixed paths return correct shape, (b) non-existent path → `{ isGit: false, isPi: false }`, (c) empty array → `{}`.
- [x] 5.4 Add a route-integration test in the same file (or a new `browse-flags-route.test.ts`) covering: bulk endpoint happy path, malformed `paths` → 400, over-cap → 400, empty array → 200 with `{}`, remote-origin block (if browse-endpoint already tests this, mirror the pattern).

## 6. Tests: client

- [x] 6.1 In `packages/client/src/components/__tests__/PathPicker.test.tsx`, update the mock browse-API helpers so initial entries omit `isGit` / `isPi` and a new mocked `classifyPaths` resolves with the flag map after first paint. Add at least one test that renders the picker, advances past the initial fetch, awaits the flags promise, and asserts the `git` / `pi` badges appear for the right rows.
- [x] 6.2 Add a test that rapid `fetchDir` re-invocation (e.g. two consecutive query changes) cancels the first phase-2 request — assert via the abort signal having been triggered before the second response resolves.
- [x] 6.3 In `packages/client/src/components/__tests__/PinDirectoryDialog.test.tsx`, update the response fixture to match the new optional-flags shape. Existing assertions should still pass.

## 7. Documentation

- [x] 7.1 Update `docs/architecture.md` `/api/browse` paragraph to describe the new `detect` parameter and the omitted-when-absent behavior of `isGit` / `isPi`. Add a sibling paragraph for `GET /api/browse/flags` (request, response, caps, error shape).
- [x] 7.2 Update `.pi/skills/pi-dashboard/references/api-reference.md`: document `detect=1` on `/api/browse` and add a section for `/api/browse/flags` with a worked example. Update the existing example response that includes `isGit` / `isPi` to call out that those fields appear only with `detect=1`.
- [x] 7.3 Sweep `.pi/skills/pi-dashboard/references/recipes.md` (and any other recipe file) for examples that read `isGit` / `isPi`; add `detect=1` to those requests so the recipes still work. (No-op — grep found zero references.)
- [x] 7.4 Update the `AGENTS.md` "Key Files" entry for `packages/server/src/browse.ts` and `packages/server/src/routes/file-routes.ts` to mention the split (one-line each).

## 8. Verification

- [x] 8.1 Run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm all tests pass — including the previously-failing browse tests (now hermetic) and the new bulk-endpoint coverage. (3336 passed / 0 failed.)
- [x] 8.2 Build and restart the dashboard server, then manually exercise the path picker (Pin Directory dialog) on a directory with > 200 entries. Confirm: enumeration is instant, badges fade in within a few hundred ms, no console errors, abort works on rapid query changes.
- [x] 8.3 With the dashboard skill, issue `curl '<base>/api/browse?path=/some/dir&detect=1'` and confirm the response shape matches today's documented form. Issue `curl '<base>/api/browse/flags?paths=…'` for a JSON array of paths and confirm the response shape matches the spec.
- [x] 8.4 Run `openspec validate split-browse-flags` and confirm zero errors.
