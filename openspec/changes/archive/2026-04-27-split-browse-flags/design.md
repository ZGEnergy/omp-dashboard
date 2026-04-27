## Context

`GET /api/browse` is the engine behind `PathPicker` (Pin Directory dialog).
Today every call does:

```
readdir(dir)                          ← 1 syscall
filter / sort / slice(MAX_ENTRIES=200)
for each surviving entry (≤200):
  fs.access(entry/.git)               ← N syscalls (parallel)
  fs.access(entry/.pi)                ← N syscalls (parallel)
return entries with isGit/isPi populated
```

The classification half is consumed in exactly one place — two text
badges in `PathPicker.tsx:426-430`. It is the cause of the 200-entry cap
(any higher and the parallel `fs.access` storm becomes a real cost) and
is the proximate cause of the two host-coupled tests in
`browse-endpoint.test.ts` that currently fail on developer machines whose
project parent contains > 200 siblings.

Stakeholders: dashboard server (route + browse module), web client
(PathPicker, PinDirectoryDialog), `pi-dashboard` skill (API reference +
recipes), test suites for all of the above.

## Goals / Non-Goals

**Goals:**
- Make `GET /api/browse` cheap by default (single `readdir`, no per-entry
  probes).
- Preserve the documented public-API shape: skill recipes that pass an
  explicit `detect=1` query parameter SHALL get today's eager response
  unchanged.
- Provide a bulk-classification endpoint
  (`GET /api/browse/flags?paths=…`) that the picker (and any future
  consumer) can use to fill badges lazily.
- Keep `fs.access`-based detection (worktree-safe — `.git` is a *file* in
  worktrees; `readdir` shortcuts would silently regress).
- Replace host-coupled tests with hermetic tmpdir fixtures.

**Non-Goals:**
- Bumping `MAX_ENTRIES`. The cap-and-truncation UX is tracked separately
  (`surface-browse-truncation`).
- Caching flag results. mtime-keyed caching is plausible but ships behind
  its own proposal once we have real picker-usage data.
- Introducing pagination.
- Adding new auth surface — both endpoints reuse the existing
  `/api/browse` localhost / trusted-network gates.
- Reshuffling unrelated `BrowseEntry` fields (`name`, `path`).

## Decisions

### D1. `detect` is a query parameter on `/api/browse`, default off

`GET /api/browse?path=…&q=…&detect=1`

When `detect` is omitted (or not equal to `1`), the server SHALL skip
per-entry `fs.access` probes and return entries whose `isGit` / `isPi`
fields are `false`. When `detect=1`, behavior is unchanged from today.

Alternatives considered:
- *Default on, opt out via `detect=0`.* Rejected — defeats the perf goal
  for the only known consumer (the picker, which doesn't need eager
  badges).
- *New endpoint `/api/browse/v2`.* Rejected — version-suffix endpoints
  are heavier than a query flag for a 2-field shape change, and bisecting
  versions across the skill API doc was not worth the noise.
- *Drop `isGit` / `isPi` fields entirely from `BrowseEntry`.* Rejected —
  documented in the skill API reference; passing `detect=1` is the
  back-compat door that keeps that contract working.

### D2. Bulk classifier is `GET /api/browse/flags?paths=<json-array>`

Request: a single `paths` query parameter whose value is a
URL-encoded JSON array of absolute path strings.

Response:
```
{
  success: true,
  data: {
    flags: { [absolutePath: string]: { isGit: boolean; isPi: boolean } }
  }
}
```

Constraints:
- `paths` length SHALL be capped at **100** per request. Over the cap →
  `{ success: false, error: "too many paths" }` with HTTP 400.
- Per-path failures (ENOENT, EACCES, ELOOP, race-on-deletion, anything)
  SHALL surface as `{ isGit: false, isPi: false }` for that key — exactly
  the today-shape of `fs.access`-with-fallback.
- Internal probe concurrency SHALL be bounded (initial value: 32). This
  is server-internal; clients see a single response.

Alternatives considered:
- *POST with JSON body.* GET keeps the skill API pattern (everything else
  in the browse family is a GET) and lets HTTP caches see distinct URLs.
  The 100-path cap keeps URL length under typical 8 KB server limits.
- *Repeated `paths=…` instead of a JSON array.* Rejected — JSON-array
  encoding scales better past ~10 entries and matches existing patterns
  elsewhere in the dashboard REST surface.
- *Embed flag detection inside `/api/browse` as a second pass triggered
  by a different param (e.g. `detect=lazy`).* Rejected — couples
  enumeration cache invalidation to classification, and complicates the
  client because both halves arrive in one response.

### D3. `BrowseEntry.isGit` / `isPi` become TS-optional, wire shape unchanged

```ts
export interface BrowseEntry {
  name: string;
  path: string;
  isGit?: boolean;  // populated only when detect=1
  isPi?: boolean;   // populated only when detect=1
}
```

The server omits the fields when `detect` is off, and populates them when
`detect=1`. Clients that read the fields without checking get
`undefined` — TypeScript catches this at compile time. JS-only consumers
treat `undefined` as falsy, which matches the "unknown / not detected"
intent.

Alternatives considered:
- *Always send the fields, set to `false` when `detect` is off.*
  Rejected — `false` is indistinguishable from "we checked and it's not
  a git repo", which is a real semantic loss for any future caller.
- *Sentinel value (e.g. `null`).* Rejected — TS optional + JSON omission
  is idiomatic and self-documenting.

### D4. PathPicker uses a two-phase fetch with shared abort

```
PathPicker.fetchDir(dir, q)
  abortRef = new AbortController()
  ┌─ phase 1 ────────────────────────────────────────┐
  │ GET /api/browse?path=dir&q=q                    │
  │   → entries[] (no flags)                         │
  │   → setEntries(entries)                          │
  └──────────────────────────────────────────────────┘
  ┌─ phase 2 (fire-and-forget, same abort signal) ───┐
  │ GET /api/browse/flags?paths=<entries[].path>     │
  │   → flagMap                                      │
  │   → setEntries(entries.map(e => ({...e, ...flagMap[e.path]}))) │
  └──────────────────────────────────────────────────┘

Aborting `abortRef` cancels both phases. If phase 1 errors, phase 2 is
never started. If phase 2 errors, the picker keeps phase 1's flag-less
entries — silent fallback (badges just don't appear).
```

The picker SHALL NOT block the initial render on phase 2. Badges fade in
when phase 2 resolves. Phase 2 is skipped entirely when `entries` is
empty.

Alternatives considered:
- *Render badges synchronously by calling `/api/browse?detect=1`.*
  Rejected — defeats the perf win; would only be worth it if every render
  needed flags, which it doesn't.
- *Probe per row on hover / scroll-into-view.* Rejected for v1 — adds
  complexity (intersection observer, debouncing) for a workload that fits
  comfortably in one bulk call.

### D5. Bounded concurrency: hand-rolled, no new dependency

The bulk endpoint's internal probe fan-out SHALL be capped at **32**
in-flight `fs.access` calls. We implement this as a tiny chunked worker
loop in `browse.ts` rather than adding `p-limit` as a dependency. The
existing `packages/shared/src/semaphore.ts` is FIFO-async-token-style and
fits this use cleanly; we'll reuse it instead of introducing a new
primitive.

### D6. Hermetic tmpdir tests replace host-coupled assertions

The two failing tests (`should detect isGit flag for git repos`,
`should detect isPi flag for pi projects`) walk `import.meta.dirname`
to find the project parent and rely on the project basename actually
appearing in the response. On large parent dirs (>200 siblings) the cap
silently slices it out.

Replacement: each test creates a fresh tmpdir via `fs.mkdtemp`, populates
it with three sibling directories (one with `.git`, one with `.pi`, one
plain), invokes the (refactored) classifier directly, and asserts the
shape. Hermetic, fast, and exercises the actual semantics rather than
host topology. The existing test that demonstrates "alphabetical order"
and "no hidden dirs" stays unchanged — those don't depend on the host
beyond `os.homedir()`.

## Risks / Trade-offs

- **Risk: skill recipes break for callers who don't migrate.**
  → Mitigation: `detect=1` preserves today's shape exactly. Skill API
  reference SHALL document the parameter; recipes that consumed
  `isGit` / `isPi` SHALL be updated in the same change.

- **Risk: TS compile breakage in client / test code that destructures
  `isGit` / `isPi` without optional handling.**
  → Mitigation: `BrowseEntry.isGit` / `isPi` are read in exactly one
  client file (`PathPicker.tsx`) and a handful of test mocks. The diff
  is mechanical and tractable.

- **Risk: the bulk endpoint becomes a back-channel for filesystem
  reconnaissance.**
  → Mitigation: it inherits the same `localhost-only` /
  `trusted-network` gate as `/api/browse`. The information leak is
  bounded to "is `.git` / `.pi` present at this path", which is no
  worse than `/api/browse?detect=1` already exposes today.

- **Risk: race on deletion between phase 1 and phase 2 leaves an entry
  visible without flags.**
  → Accepted. The picker already handles this (the row stays
  selectable; clicking a vanished dir surfaces the standard error).
  The bulk endpoint returns `{ isGit: false, isPi: false }` for missing
  paths, which is the same fallback as today's eager probe.

- **Risk: a slow filesystem (network mount) makes phase 2 visibly lag
  behind phase 1.**
  → Accepted as a known regression-from-perfect, but a strict
  improvement over today: phase 1 is now fast where today the entire
  call would have stalled. The picker remains usable during the lag —
  just without badges.

- **Risk: bumping the path-count cap later (>100) collides with the
  default URL length limit on Fastify.**
  → Mitigation: documented; if we ever raise the cap we move to a POST
  variant. Out of scope for v1.

- **Trade-off: two HTTP requests per directory navigation instead of
  one.**
  → Acceptable. Phase 1 returns immediately; phase 2 piggybacks on the
  same abort controller. Network round-trips are the same order of
  magnitude as today's single-request fan-out, and on the localhost
  loopback (the default deployment) latency is negligible.

## Migration Plan

Single-PR change, no DB or persisted-state migration. Order of work
matches `tasks.md`:

1. Refactor `browse.ts` to expose a flag-less `listDirectories` and a
   new `classifyPaths` helper.
2. Wire the routes — add `detect` to `/api/browse`, add
   `/api/browse/flags`.
3. Update shared types: optional flags + new request/response shapes.
4. Update `PathPicker` to two-phase fetch.
5. Update `docs/architecture.md` and the `pi-dashboard` skill API
   reference.
6. Replace host-coupled tests; add new coverage for `detect=0`,
   `detect=1`, bulk endpoint shape, and bulk endpoint error paths.

Rollback: pure code change, revert PR. No data to undo.

## Open Questions

- Should the bulk endpoint accept a single absolute root and a list of
  *relative* names instead of fully-qualified paths? Smaller URLs, but
  loses the ability to mix paths from different parents (the picker
  doesn't need that today, but a future consumer might). **Defer** —
  current API stays simple; revisit if a real consumer needs cross-root
  classification.
- Concurrency cap of 32 was picked by instinct. Worth a one-shot
  benchmark (200 paths against a warm SSD) before merge? **Defer to
  implementation phase** — easy to A/B with `console.time` and adjust.
