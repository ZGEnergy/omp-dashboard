# fix-resolve-client-dir-prefers-durable-managed-path

## Why

`packages/server/src/resolve-client-dir.ts` orders its strategies "never
reorder, only append". Strategy 1 is the Node module resolver
(`createRequire(...).resolve("@blackbelt-technology/pi-dashboard-web")`).
Strategy 6, appended last as part of `streamline-electron-bootstrap-and-recovery`
(Failure 2), is the managed-install root probe at
`<managedDir>/packages/dist/client/`.

In the Electron managed-install layout the chain produces a live 404 on
`GET /` every launch. Timeline:

```
T+0  Electron launches → materializeWorkspaceSymlinks() populates
     ~/.pi-dashboard/node_modules/@blackbelt-technology/pi-dashboard-web/dist/
T+1  Electron spawns server → server.ts boots
T+2  resolveClientDir() runs → strategy 1 wins
     clientDir = ~/.pi-dashboard/node_modules/@blackbelt-technology/pi-dashboard-web/dist
T+3  fastify.register(fastifyStatic, { root: clientDir }) — root locked in
T+4  Bootstrap runs npm install for offline-cache packages (pi/openspec/tsx)
     into ~/.pi-dashboard/. npm install reconciles node_modules and WIPES
     the @blackbelt-technology/ scope dir.
T+5  fastifyStatic.root is now a deleted path. All GET / return 404.
```

Reproduced live on 2026-05-17 with a freshly built DMG containing every
post-`streamline-electron-bootstrap-and-recovery` fix in source. The
shipped resolver code was correct; the order was wrong.

The managed-root path (`<managed>/packages/dist/client/`) is **durable** —
it lives in `<managed>/packages/` (a static extraction target) rather
than `<managed>/node_modules/` (which npm rewrites on every install).
The strategy was added specifically for this race; ordering it last
defeated its purpose.

This is the same class of bug as the
`fix-build-installer-stale-server-bundle` reasoning: a contract ("never
reorder") that sounded conservative actually hid the real invariant
("durable paths first"). The fix is to make that invariant explicit.

## What Changes

1. **Promote the managed-root candidate to the head of the list** when
   `resolveManagedDirRoot(serverDir)` returns non-null. Other strategies
   (current 1–5) follow in their existing relative order. Layouts without
   a `.version` marker (dev / plain `npm i -g`) see no behaviour change.

2. **Update the file-header comment** to encode the new contract:
   "durable paths first, volatile (scope-dir) paths after."

3. **Update `static-client-resolution.test.ts`**:
   - The "strategy #6 wins when scope-dir wiped" test changes its
     assertion: the managed-dir candidate is now the **first** entry,
     not the last.
   - Add a new test pinning the live failure mode: when both a wiped
     strategy-1 path (`@blackbelt-technology/pi-dashboard-web/dist/`
     without `index.html`) AND a populated managed-root target exist,
     the resolver picks the managed-root path.

4. **No change to `server.ts`** — it just calls the resolver and feeds
   the result into `fastifyStatic`. The bug is purely in the chain.

5. **Document the contract flip** in the file-index row for
   `resolve-client-dir.ts`. AGENTS.md is untouched.

Out of scope:
- Re-materializing the scope dir after bootstrap. That fix belongs to
  `streamline-electron-bootstrap-and-recovery` (post-bootstrap re-materialize
  step) and addresses other downstream consumers of the scope dir
  (e.g. `@fastify/static` would still 404 if the user reloaded between
  T+2 and T+5 on legacy resolution order; the present change is narrower
  and complementary).
- Removing strategies 1–5. They still serve dev / npm-global / monorepo
  layouts correctly.
- Lazy per-request resolution. Re-resolving on every request is slower
  and changes far more code than the one-line reorder.

## Capabilities

### Modified Capabilities

- `optional-static-serving`: the resolution order learns that managed-install
  paths are durable and MUST be preferred over volatile scope-dir paths.
  Delta in
  `openspec/changes/fix-resolve-client-dir-prefers-durable-managed-path/specs/optional-static-serving/spec.md`.

## Impact

- **Code:** `packages/server/src/resolve-client-dir.ts` (chain reorder
  + comment).
- **Tests:** `packages/server/src/__tests__/static-client-resolution.test.ts`
  (assertion flip + one new pinning test).
- **Docs:** `docs/file-index-server.md` row for `resolve-client-dir.ts`
  notes the durable-first contract.
- **Runtime behaviour:** Electron managed-install GET `/` returns
  `index.html` (200) on every launch, including launches that happen
  during or after the bootstrap npm-install wipe. Dev / npm-global
  layouts unchanged.
- **Compat:** strict superset. Layouts without `.version` keep the exact
  chain order they had. Layouts with `.version` get one extra candidate
  ahead of the rest — equivalent to the user manually setting an
  environment override but automatic.
- **Cross-refs:** This change is the immediate follow-up surfaced by
  `fix-build-installer-stale-server-bundle` (which exposed the bug by
  shipping fresh server source) and complements
  `streamline-electron-bootstrap-and-recovery` (Failure 2 root cause
  is fully closed only with this reorder).
