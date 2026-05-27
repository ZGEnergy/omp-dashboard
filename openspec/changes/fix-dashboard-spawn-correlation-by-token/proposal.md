## Why

> **Update (post-`5a31daa6`):** the original cause analysis below has been
> partially addressed by `fix-dashboard-source-mislabelling` (commit
> `5a31daa6`), which added a strong env-var-backed signal
> (`PI_DASHBOARD_SPAWN_TOKEN` → `msg.dashboardSpawned` on every
> `session_register`) and extracted the decision into
> `packages/server/src/dashboard-source-decision.ts`. The remaining defect
> surface is **the cwd-FIFO fallback branch** plus **stale `.meta.json`
> sidecars** written before the fix landed. This proposal is now scoped to
> those two surfaces only.

A CLI-launched pi session can be incorrectly stamped `source: "dashboard"`
when the user happens to launch it in a cwd where the dashboard recently
issued a Spawn. The original cause (cwd-only matcher in `event-wiring.ts`)
has been mitigated for **bridges that set `PI_DASHBOARD_SPAWN_TOKEN`**:
`decideDashboardSource` now stamps on the strong flag and leaves the cwd
FIFO counter alone. However:

1. The legacy cwd-FIFO fallback branch (`pendingCount > 0 && isNewSession`)
   still stamps and persists `source: "dashboard"` to `.meta.json` on a
   cwd-only match. This branch is reachable from any bridge that does not
   advertise `dashboardSpawned: true` (older bridges, future external
   integrations) and reproduces the original mis-attribution.
2. Existing user installations still carry incorrect `source: "dashboard"`
   in `.meta.json` sidecars written before the fix shipped. The
   bridge-side `source-detector.ts` guard (commit `be56f068`) hides this
   at read time when a TUI is attached, but the on-disk data remains
   wrong, and survives across restarts / fresh bridge versions.

## What Changes

- **Tighten the cwd-FIFO fallback in `decideDashboardSource`.** When the
  decision is driven by the legacy counter (no `dashboardSpawned` flag),
  emit a single log line per consume — paralleling the existing fallback
  log in `headlessPidRegistry.linkSession` — so we can observe how often
  the branch fires in the wild before considering removal.
- **Skip the `.meta.json` write on cwd-FIFO matches.** In-memory
  `sessionManager.update` + `broadcastSessionUpdated` still fire (so the
  current dashboard view is correct), but the sidecar is left untouched
  on the weak signal. The strong `dashboardSpawned` path continues to
  write the sidecar as today.
- **Add a `STRICT_SPAWN_CORRELATION=1` env switch** that suppresses the
  cwd-FIFO branch entirely (no stamp, no write, no broadcast). Off by
  default; intended for QA / power users / future default-on.
- **One-shot cleanup utility** that scans `~/.pi/agent/sessions/**/*.meta.json`
  and removes `source: "dashboard"` from sidecars whose adjacent `.jsonl`
  carries evidence of a TUI session (`hasUI: true` in any of the first
  ~50 entries). Idempotent; safe to re-run.

Explicitly **not** in scope (superseded by `5a31daa6`):

- A new `pending-dashboard-spawns.ts` registry keyed by `spawnToken`.
  The env-var-on-every-register approach is strictly stronger
  (survives dashboard restart while pi is alive) than a one-shot
  token registry would have been. The cwd `Map<string, number>`
  counter stays as the **only** legacy-bridge fallback.
- A `PendingDashboardSpawns` class with PID/token tiers and a TTL
  sweeper. Not needed — the strong signal is now flag-based, not
  registry-based.
- Changes to `process-manager.ts` to record `{ token, cwd }` at spawn
  time. Not needed for the same reason.
- The `source-detector.ts` defensive guard (already in place,
  unchanged).

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `spawn-correlation`: Document that **only the strong signal**
  (`msg.dashboardSpawned === true`, backed by `PI_DASHBOARD_SPAWN_TOKEN`)
  may persist `source: "dashboard"` to `.meta.json`. The cwd-FIFO
  fallback may update in-memory state for UI continuity but SHALL NOT
  write the sidecar. Under `STRICT_SPAWN_CORRELATION=1` the cwd-FIFO
  branch is suppressed entirely.

## Impact

**Code:**

- `packages/server/src/dashboard-source-decision.ts` — extend
  `DashboardSourceDecision` with a `persistMeta: boolean` field;
  `decideDashboardSource` sets it `true` only when `dashboardSpawned`
  drove the decision.
- `packages/server/src/event-wiring.ts` — branch on
  `decision.persistMeta` around the `writeSessionMeta` call; emit a log
  line whenever `decision.consumeLegacyCounter` is true; honour
  `STRICT_SPAWN_CORRELATION=1` to short-circuit the legacy branch.
- `packages/server/src/__tests__/dashboard-source-decision.test.ts` —
  extend with cases asserting `persistMeta` is set correctly on each
  arm; strict-mode case suppresses both stamp and persist.
- `packages/server/src/__tests__/event-wiring-source-stamp.test.ts`
  (new, small) — assert that the cwd-FIFO branch broadcasts but does
  not call `writeSessionMeta`, and that the strong-signal branch does
  both.
- `scripts/repair-meta-source.mjs` (new) — pure Node, no deps;
  walks the sessions tree, removes `source: "dashboard"` where TUI
  evidence is present in the adjacent `.jsonl`.
- `docs/faq.md` — new entry "Why does my CLI session show the
  headless robot icon?" linking the script and the `5a31daa6`
  history.

**APIs / protocol:** none.

**Migration / data:** existing `.meta.json` files written before
`5a31daa6` may still carry incorrect `source: "dashboard"`. The
one-shot cleanup script is the migration path. Idempotent.

**Risk:** very low. The decision-matrix change is purely subtractive
(legacy branch writes less than before). The strict-mode flag is
opt-in. The cleanup script writes via atomic tmp+rename and only
touches files with positive TUI evidence.

**Backout:** revert `dashboard-source-decision.ts` and
`event-wiring.ts` to the `5a31daa6` shape. The cleanup script is
one-shot and idempotent; no inverse needed.
