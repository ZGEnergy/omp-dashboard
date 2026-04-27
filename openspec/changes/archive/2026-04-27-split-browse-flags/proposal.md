## Why

`GET /api/browse` currently does two unrelated jobs in one call: enumerate
directories and classify each one with `isGit` / `isPi` badges. The
classification fires up to 400 `fs.access` syscalls per request (200 entries
× 2 probes), runs eagerly on every keystroke / navigation in the path
picker, and is the only reason the entry cap is set as low as 200. The
badges themselves are consumed in exactly one place — two visual hints in
`PathPicker.tsx` lines 426–430.

Two recent test failures in `browse-endpoint.test.ts` (`should detect isGit
flag for git repos`, `should detect isPi flag for pi projects`) accidentally
exposed the consequence: on a developer machine where the project's parent
directory contains more than 200 siblings, the project is silently sliced
out of the result by the cap. The tests fail because the response is
shaped by a syscall-amplification budget instead of by what the user asked
for. Same root cause hits real users with large project parents (`~/src`,
`~/Project`, `$GOPATH/src`).

We want to (a) decouple enumeration from classification so the picker
stays responsive at much higher caps and (b) keep the documented public API
working — the `pi-dashboard` skill's API reference and recipes show
`isGit` / `isPi` in example responses, so a hard removal would break
documented behavior.

## What Changes

- Add an opt-in `detect=1` query parameter to `GET /api/browse`. When
  omitted (the new default), `BrowseEntry.isGit` / `isPi` SHALL be `false`
  and no per-entry `fs.access` probe SHALL run — `/api/browse` becomes a
  single-syscall enumeration. When `detect=1` is passed, server behavior
  is unchanged from today (eager probes, same fields populated). This
  preserves the documented skill-recipe contract for callers that pass
  `detect=1`.
- Add `GET /api/browse/flags?paths=<json-array>` — a bulk classifier that
  accepts up to 100 absolute paths in one call and returns
  `{ [path]: { isGit, isPi } }`. The endpoint SHALL apply bounded
  concurrency internally and SHALL preserve the existing
  "any error → false" semantics from `fs.access` (ENOENT, EACCES, ELOOP,
  race on deletion all map to `false`).
- Update `PathPicker` to call `/api/browse` (without `detect=1`) for the
  fast list, then fire one `/api/browse/flags` request for the rendered
  rows. Badges fade in when the response arrives. Aborted requests cancel
  the flags lookup as well.
- **BREAKING** in the type sense only: `BrowseEntry.isGit` and
  `BrowseEntry.isPi` SHALL become optional (`boolean | undefined`) in
  `packages/shared/src/rest-api.ts`. Wire format unchanged when the server
  populates them; absent fields surface as `undefined` to TS consumers.
  No external skill consumer reads these fields without `detect=1`, so no
  behavior break for documented usage.
- Replace the two host-coupled tests in `browse-endpoint.test.ts` with
  hermetic tmpdir fixtures (siblings created with `.git` / `.pi`
  subdirs). New tests SHALL also cover (a) `detect=0` returning `false`
  flags without probing, (b) the bulk endpoint's error semantics, and
  (c) the bulk endpoint's path-count cap.

Out of scope (deliberately) for this change:
- Bumping `MAX_ENTRIES`. The cap-and-truncation UX is a separate concern
  tracked under a follow-up `surface-browse-truncation` change.
- mtime-keyed flag caching. Tempting but ships behind a separate
  proposal once we have data on real picker usage.
- Replacing `fs.access` with `readdir` for a 2-syscalls-into-1
  optimization. Documented as a side effect we explicitly chose NOT to
  make: `.git` is a regular file in git worktrees, so `fs.access` is the
  correct primitive.

## Capabilities

### New Capabilities
_(none — this change refines an existing capability)_

### Modified Capabilities
- `filesystem-browser`: The directory browse API gains an opt-in
  `detect` query parameter that gates eager `.git` / `.pi` classification,
  and grows a new bulk-classification endpoint
  (`GET /api/browse/flags?paths=…`). The shape of `BrowseEntry` changes
  from "always populated `isGit` / `isPi`" to "populated only when
  classification was requested".

## Impact

- **Server**: `packages/server/src/browse.ts` — split internal helpers;
  add `classifyPaths(paths: string[])`. New route in
  `packages/server/src/routes/file-routes.ts`.
- **Shared types**: `packages/shared/src/rest-api.ts` — `isGit` and
  `isPi` become optional on `BrowseEntry`; new request/response types for
  the bulk endpoint.
- **Client**: `packages/client/src/components/PathPicker.tsx` — two-phase
  fetch, lazy badge fill-in;
  `packages/client/src/lib/browse-api.ts` — new `classifyPaths` helper
  with abort support.
- **Tests**:
  - `packages/server/src/__tests__/browse-endpoint.test.ts` — replace
    host-coupled `isGit`/`isPi` tests with hermetic tmpdir fixtures; add
    coverage for `detect=0` default and the bulk endpoint.
  - `packages/client/src/components/__tests__/PathPicker.test.tsx` and
    `PinDirectoryDialog.test.tsx` — update mocks to reflect optional
    flags; add a render-stable test that verifies badges appear after
    the lazy classify call resolves.
- **Documentation**:
  - `docs/architecture.md` — update the `/api/browse` paragraph and add
    a `/api/browse/flags` paragraph.
  - `.pi/skills/pi-dashboard/references/api-reference.md` — document
    `detect=1` for skill consumers that want the today-shape; document
    `/api/browse/flags` for skill recipes that want bulk classification.
- **No protocol break for skill recipes** that pass `detect=1`.
- **No additional auth surface** — both endpoints reuse the existing
  `/api/browse` localhost / trusted-network gates.
