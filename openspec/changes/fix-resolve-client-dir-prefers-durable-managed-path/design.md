# Design: fix-resolve-client-dir-prefers-durable-managed-path

## Context

The existing chain in `resolve-client-dir.ts`:

| # | Strategy | Path family | Durable? |
|---|---|---|---|
| 1 | Node module resolver | `<scope-dir>/pi-dashboard-web/dist` | **No** — wiped by `npm install` |
| 2 | Scoped sibling | `<serverDir>/../../pi-dashboard-web/dist` | **No** — same scope dir |
| 3 | Parent-hoisted scope | `<serverDir>/../../../@blackbelt-technology/pi-dashboard-web/dist` | **No** — same scope dir |
| 4 | Monorepo workspace sibling | `<serverDir>/../../client/dist` | Yes (dev), Yes (monorepo install) |
| 5 | Legacy | `<serverDir>/../../dist/client` | Yes (legacy npm install layout) |
| 6 | Managed-install root | `<managedDir>/packages/dist/client` (via `.version` walkup) | **Yes** — `<managed>/packages/` is a static extraction target |

Strategies 1–3 share a single failure mode: they all resolve into
`<managed>/node_modules/@blackbelt-technology/`. That subtree is rewritten
on every `npm install` the bootstrap loop runs. Strategy 6 sidesteps the
problem by reading from `<managed>/packages/` instead — the directory
populated by `bundle-server.mjs` at build time and extracted by
`bundle-extract.ts` at install time. Nothing in the bootstrap loop touches
`<managed>/packages/`.

## Goals / Non-Goals

**Goals:**
- `GET /` returns `index.html` (200) on every Electron launch, including
  immediately after the bootstrap npm-install wipe.
- Dev / monorepo / plain `npm i -g` users see no behaviour change. The
  test that pins strategy 1 winning when the web package is resolvable
  MUST still pass for those layouts.
- The change is one-file + a comment + two test assertions. No new
  surface area, no new strategies.

**Non-Goals:**
- Re-materialize the scope dir after bootstrap. Handled by
  `streamline-electron-bootstrap-and-recovery`. The two changes are
  complementary; either one alone fixes the live 404, but together they
  also restore the scope dir for any other code path that depends on it.
- Lazy per-request resolution. Adds latency, expands the affected code
  surface from one file to three, and is unnecessary given the durable
  path is correct and stable.
- Removing strategies 1–5. They're load-bearing for dev / npm-global /
  monorepo layouts that have no `.version` marker.

## Decisions

### D1. Where in the chain to insert the managed-root candidate
Three viable positions:

- **(A) Always first when `managedRoot` is non-null.**
  Pro: simplest. Always picks the durable path in any layout where one
  exists. Con: a dev/monorepo user who *happens* to also have a
  `.version` file somewhere up the tree would skip their dev build.
  Mitigation: `.version` is only ever written by the managed-install
  flow; dev checkouts don't produce it.
- **(B) After strategy 4 (monorepo sibling) but before strategies 1–3.**
  Pro: keeps the "if you're in a monorepo, dev wins" invariant.
  Con: more positions to remember; the rationale is convoluted.
- **(C) Always last (status quo).** Already broken.

**Chosen: A.** The `.version` marker is the unambiguous signal "this is
a managed install". The probability of a stray `.version` in a dev
checkout is essentially zero — it's not a common filename, and the
walkup terminates at the filesystem root. The simplest invariant
("`.version` ⇒ managed install ⇒ durable path wins") is also the
correct one.

### D2. How to express the reorder in code
Two options:

- **(A) Push the managed candidate first, then the rest.**
  ```ts
  const candidates: string[] = [];
  const managedRoot = resolveManagedDirRoot(opts.serverDir, { existsSync });
  if (managedRoot) {
    candidates.push(path.join(managedRoot, "packages", "dist", "client"));
  }
  // strategies 1–5 unchanged below
  ```
- **(B) Build the legacy list, prepend the managed candidate at the end.**
  ```ts
  // legacy build...
  if (managedRoot) candidates.unshift(path.join(managedRoot, "packages", "dist", "client"));
  ```

**Chosen: A.** Reading order matches contract order. `unshift` is
mutate-at-distance; the early `push` keeps the candidate construction
strictly top-to-bottom. The diff is symmetric (delete the old block at
the bottom, insert at the top).

### D3. Header-comment contract wording
The current file header is wrong by construction: "new strategies are
appended, never reordered." Replace with the actual invariant we now
enforce:

> Layout-detection strategies are ordered **durable paths first**.
> Volatile paths (anything under `<managedDir>/node_modules/`) come
> last. New strategies are inserted at the position consistent with
> their durability, not by date of addition.

This makes the next reorder uncontroversial.

### D4. Test update strategy
Two assertions change:

- `picks strategy #6 (managed-dir root) when scope-dir is wiped`:
  the test asserts `candidates[candidates.length - 1]` is the managed-dir
  path. Flip to `candidates[0]`.
- New test: `prefers durable managed-root over volatile scope-dir even
  when scope-dir resolves`. Plant BOTH `<managed>/node_modules/...
  /pi-dashboard-web/dist/index.html` AND
  `<managed>/packages/dist/client/index.html`. Assert the returned
  `clientDir` is the latter.

Other existing tests don't depend on the position of the managed
candidate (they don't use `.version`) and remain unchanged.

### D5. Run-time validation path
Manual smoke after implementation:

```bash
# build a DMG with the fix
cd packages/electron && npm run build:local
open out/make/PI-Dashboard-darwin-x64-*.dmg
# drag to /Applications, relaunch
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8000/
# expected: HTTP 200 (was HTTP 404 before this change)
```

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| A `.version` file leaks into a dev checkout (someone runs the Electron installer alongside the repo) and the durable strategy now masks the monorepo dev build. | `.version` walkup terminates at the filesystem root. The Electron installer writes `.version` into `~/.pi-dashboard/`, which is never an ancestor of a checkout. Dev checkouts also have their own `optional-static-serving` strategies (monorepo workspace sibling, strategy 4 in the new order) that come ahead of strategy 5+. |
| The Vite dev server (`npm run dev`) starts in a checkout whose ancestors include `~/.pi-dashboard/`. | `~/.pi-dashboard/` is not an ancestor of most checkouts (usually `~/Project/...`). If it ever is, the dev launcher already passes `--dev` and the server special-cases dev mode (Vite proxy), bypassing the static handler entirely. The dev path doesn't read `clientDir` at all in that mode. |
| Some future strategy is added without thinking about durability. | The header comment now spells out the invariant. The lint test from `fix-build-installer-stale-server-bundle` doesn't cover this file; adding one is over-engineering. The new test cases serve as executable documentation. |
| Down-stream consumers of strategy 1's return value depend on the path being inside `node_modules/`. | None exist. `clientDir` flows into `fastifyStatic`, which takes any absolute path as `root`. The managed-root path is also absolute and a valid static-file root. |

## Open Questions

None block implementation. Flagging for awareness:

- Should the file header also document the `.version` marker semantics
  (its location, contents, who writes it)? Probably yes, but that
  belongs in `packages/shared/src/managed-paths.ts` next to
  `resolveManagedDirRoot`. Out of scope for this change.
- Should `resolveClientDir` log its decision (to `server.log`)? Maybe,
  but it adds churn for what is currently a silent pure function. Out
  of scope.
