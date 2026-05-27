> **Scope update (post-`5a31daa6`):** the strong-signal path
> (`PI_DASHBOARD_SPAWN_TOKEN` → `msg.dashboardSpawned`) and the
> extracted `dashboard-source-decision.ts` module already shipped
> in `fix-dashboard-source-mislabelling`. Tasks 1–3 of the original
> plan are **superseded**. What remains is hardening the cwd-FIFO
> fallback branch and migrating already-written sidecars.

## 1. Extend the decision matrix with `persistMeta`

- [ ] 1.1 In `packages/server/src/dashboard-source-decision.ts`, add a
  third boolean to `DashboardSourceDecision`: `persistMeta`. Set it
  `true` iff `dashboardSpawned === true` drove the decision. Document
  on the interface that cwd-FIFO matches SHALL NOT persist to the
  sidecar.
- [ ] 1.2 Add a fourth input `strictCorrelation: boolean`. When
  `true`, the function SHALL NOT take the cwd-FIFO branch — return
  `{ shouldStamp: false, consumeLegacyCounter: false, persistMeta: false }`.
- [ ] 1.3 Extend `packages/server/src/__tests__/dashboard-source-decision.test.ts`
  with cases for: strong signal sets all three flags appropriately;
  cwd-FIFO branch sets `shouldStamp` + `consumeLegacyCounter` but NOT
  `persistMeta`; strict-mode suppresses the cwd-FIFO branch entirely;
  no-match returns all-false.

## 2. Wire the new flags in event-wiring

- [ ] 2.1 At module init in `packages/server/src/event-wiring.ts`,
  read `const strictCorrelation = process.env.STRICT_SPAWN_CORRELATION === "1"`.
- [ ] 2.2 Pass `strictCorrelation` into the `decideDashboardSource`
  call alongside the existing inputs.
- [ ] 2.3 Move the `writeSessionMeta` invocation inside an
  `if (decision.persistMeta)` guard. Keep the `sessionManager.update`
  + `broadcastSessionUpdated` calls unconditional on
  `decision.shouldStamp` so the live UI still reflects the stamp on
  legacy bridges.
- [ ] 2.4 When `decision.consumeLegacyCounter === true`, emit
  `console.log("[event-wiring] cwd-FIFO source-stamp fallback sessionId=... cwd=...")`.
  Mirror the existing log line shape in
  `headlessPidRegistry.linkSession`.

## 3. Event-wiring regression tests

- [ ] 3.1 Add `packages/server/src/__tests__/event-wiring-source-stamp.test.ts`
  with three cases:
  - Strong-signal register → `sessionManager.update` called with
    `source: "dashboard"`, `writeSessionMeta` called once,
    fallback log NOT emitted.
  - CLI register in spawn-pending cwd, no strong signal,
    `strictCorrelation=false` → `sessionManager.update` called,
    `writeSessionMeta` NOT called, fallback log emitted exactly once.
  - Same register with `strictCorrelation=true` → neither
    `sessionManager.update` nor `writeSessionMeta` invoked, no log.
- [ ] 3.2 Mock `writeSessionMeta` via vi.spyOn or DI seam (whichever
  matches existing event-wiring tests).
- [ ] 3.3 Capture stdout via `vi.spyOn(console, "log")` and assert
  the fallback log line shape.

## 4. Cleanup utility for stale sidecars

- [ ] 4.1 Create `scripts/repair-meta-source.mjs` (pure Node, no
  deps). Walk `~/.pi/agent/sessions/**/*.meta.json`.
- [ ] 4.2 For each candidate that has `source: "dashboard"`, load
  the adjacent `.jsonl`, scan the first ~50 entries for a TUI
  marker (`hasUI: true` or equivalent — confirm exact key by
  inspecting two real session files before implementing). If found,
  remove `source` from the JSON object and write back atomically
  (`*.tmp` → `rename`).
- [ ] 4.3 Print `kept N / cleaned M / errors E`. Exit 0 always
  unless an unrecoverable error reading the home dir.
- [ ] 4.4 Add a unit test using a tmpdir with three fixture
  session pairs: TUI evidence → cleaned; no evidence → kept;
  malformed JSON → counted as error, other files still processed.
  Re-run on the same tmpdir → no further changes (idempotent).

## 5. Docs

- [ ] 5.1 Add a `docs/faq.md` entry "Why does my CLI session show
  the headless robot icon?" — short caveman-style answer pointing
  at `node scripts/repair-meta-source.mjs` and naming the
  commits (`5a31daa6`, this change).
- [ ] 5.2 In the relevant `docs/file-index-*.md` split, add a row
  for `scripts/repair-meta-source.mjs` with the one-line purpose.
- [ ] 5.3 Append `See change: fix-dashboard-spawn-correlation-by-token`
  annotations to the existing rows for
  `packages/server/src/dashboard-source-decision.ts` and
  `packages/server/src/event-wiring.ts` in the server split.

## 6. Verification

- [ ] 6.1 `npm test` — every new test green, no existing test
  regressed.
- [ ] 6.2 `npm run lint` (or the project's `tsc --noEmit`
  equivalent) — clean.
- [ ] 6.3 Manual smoke A: dashboard Spawn → session card shows
  robot icon and `.meta.json` carries `source: "dashboard"`.
- [ ] 6.4 Manual smoke B: dashboard Spawn for cwd X, then launch
  CLI pi from terminal in cwd X (legacy-bridge simulation: unset
  `PI_DASHBOARD_SPAWN_TOKEN` in the CLI's env). Verify the CLI
  card renders TUI icon, `.meta.json` has no `source` field, and
  the dashboard server log carries one
  `cwd-FIFO source-stamp fallback` line.
- [ ] 6.5 Manual smoke C: same as B but with
  `STRICT_SPAWN_CORRELATION=1` set on the server. Verify no stamp
  in either UI or sidecar, and no fallback log.
- [ ] 6.6 Run `node scripts/repair-meta-source.mjs` against a
  test home seeded with one bad sidecar + one good sidecar.
  Confirm the summary matches and the second run reports
  `cleaned 0`.
