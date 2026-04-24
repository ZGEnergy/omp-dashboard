## Context

The dashboard's ServerSelector (`packages/client/src/components/ServerSelector.tsx`) lets the user switch between localhost and any number of known remote servers. The current `handleServerSwitch` handler in `packages/client/src/App.tsx` (lines 215–234) performs a destructive-first transaction:

```
click → localStorage.setItem("pi-dashboard-last-server", "host:port")
      → POST /api/config { lastServer } (to the OLD server, best-effort)
      → setSessions(new Map()) + wipe all session-related state
      → setWsUrl(newUrl)  → useWebSocket re-runs, old socket torn down
```

If the new server is unreachable, the WebSocket enters an exponential-backoff loop with no visible banner, every session card / chat / terminal is gone, and `localStorage["pi-dashboard-last-server"]` now points at the dead target — so a browser refresh re-runs `getInitialWsUrl()` (App.tsx:70) and picks up the same dead URL. The user is soft-bricked until they manually clear localStorage via devtools.

This has bitten real users. It was exposed by the "Local is always listed first, always clickable" behavior: on a thin-client laptop, a single misclick on the default-first entry with no `pi-dashboard` on localhost starts the cascade.

The previous explore-mode discussion confirmed three independent layers of the bug: (1) no pre-check, (2) destructive state/localStorage writes before verifying the target, (3) no visible recovery affordance. Disable-on-unreachable alone only addresses layer 1 and leaves layers 2-3 intact — which is why this design takes a transactional approach centered on the swap, not the click.

## Goals / Non-Goals

**Goals:**
- Make server switching fully reversible on failure: no state loss, no localStorage poisoning.
- Verify the new server is reachable (WebSocket actually opens) before any destructive step.
- Give users a visible, always-present recovery path when the active connection drops.
- Keep the UX for the happy path indistinguishable from today (no extra clicks, no modal dialogs).
- Preserve all current entries in the dropdown, including "Local" even when unreachable (users may be about to start the server).

**Non-Goals:**
- Changing the shape of the `KnownServer` data model or the `/api/known-servers` REST API.
- Redesigning the mDNS discovery flow.
- Adding a server-side health endpoint beyond `/api/health` (already exists).
- Changing how the pi bridge extension auto-discovers the dashboard (separate concern).
- Reworking the WebSocket backoff algorithm itself — only adding visibility to it.

## Decisions

### Decision 1: Staging socket, not mutable `wsUrl`

**Choice**: Open a second ("staging") WebSocket connection to the target server while the current ("live") socket stays open. Only when the staging socket reaches `readyState === OPEN` do we promote it — tear down the live socket, swap state, persist localStorage. On staging failure/timeout, discard the staging socket and leave the live socket untouched.

**Alternative considered**: Keep the single-socket model, snapshot all state before `setWsUrl`, restore on failure. Rejected because (a) snapshot/restore of `sessions`/`sessionStates`/`sessionCommands`/`sessionFlows`/`openspecMap`/`terminals`/`subscribedRef` is fragile and easy to get subtly wrong (e.g., events arriving during the transition), and (b) the user would still see a momentary empty UI during the failed switch.

**Alternative considered**: Probe `/api/health` via HTTP before switching, skip WebSocket entirely until we know it's alive. Rejected because `/api/health` reachable ≠ `/ws` reachable (different upgrade path, auth plugin can reject WS upgrades independently), and the probe-then-switch window still has a race.

**Implementation shape**: introduce a `useStagingWebSocket` helper (or extend `useWebSocket` with a `targetUrl` prop that can be null) so App.tsx holds exactly two socket references during the transition.

### Decision 2: 5-second timeout on staging connection

**Choice**: If the staging socket does not reach `OPEN` within 5 seconds of `new WebSocket(url)`, treat as failed, close it, revert the pending switch, and show the "Couldn't reach <host>" toast.

**Rationale**: Aligns with the existing `/api/health` probe in ServerSelector.tsx (line 72: `AbortSignal.timeout(2000)`) but gives the full WS handshake + auth plugin a looser budget since real-world cross-WAN scenarios (zrok tunnel, cellular) can exceed 2s. 5s is long enough to avoid false negatives on a slow remote, short enough that users don't wonder if anything is happening.

### Decision 3: localStorage write moves from click-time to open-time

**Choice**: Remove `localStorage.setItem(LAST_SERVER_KEY, …)` from `handleServerSwitch`. Add it to the staging-open success branch, immediately before (or as part of) the state-swap step.

**Rationale**: Directly fixes the "refresh stays stuck" symptom. If staging never opens, localStorage never changes, and refresh recovers to the last-known-good server.

**Side note**: Also remove the `POST /api/config { lastServer }` fire-and-forget call. That call writes to the OLD server's config right before disconnecting from it — semantically nonsensical. The commented intent ("for bridge/Electron reconnection") assumes the client is co-located with the bridge, which is not generally true. Dropping it is safe; the server-side `config.lastServer` is only read by the bridge/Electron server on its own machine, and the client writing it from a remote browser is already wrong.

### Decision 4: Unreachable entries stay clickable, rendered dimmed

**Choice**: When the availability probe reports `false` for an entry, render it with reduced opacity and a visible "Unreachable" badge, but do NOT disable the click. The click still attempts the switch, which will now fail safely via the staging-socket mechanism.

**Rationale**: A probe is a point-in-time observation; the user may be simultaneously starting the server. Hard-disabling creates the "why won't this click, it IS running" frustration. With the transactional switch in place, the worst case of clicking an unreachable entry is a 5-second spinner + toast — no data loss, no stuck state. That's acceptable.

**Alternative considered**: Hard-disable with `cursor-not-allowed`. Rejected per the above.

### Decision 5 (final): Probe only on dropdown open, once per open

**Choice**: Probe every non-current entry exactly once when the dropdown transitions from closed to open. Do NOT probe on mount. Do NOT probe on a timer. Do NOT probe while the dropdown is closed. Do NOT probe on known-servers change or on server switch. Current-server entry is considered "reachable" iff `connected === true`; no separate probe.

**Rationale**: The probe is purely cosmetic — it drives the "Unreachable" badge and the disabled state (Decision 4). The user only sees these while the dropdown is open, so that's the only time a probe is useful. Probing at any other moment is background chatter with no user-facing benefit. The transactional staging-socket switch (Decision 1) is the real safety mechanism for switching and runs on actual user intent.

**Resource note**: probe cost is bounded by user activity — one burst of N probes per dropdown open (where N is typically ≤5).

### Decision 6: Connection status banner

**Choice**: New component `ConnectionStatusBanner` rendered above `<MobileShell>` in App.tsx. Visible when the active WebSocket has been in a non-`OPEN` state for more than 3 seconds continuously. Shows: "Disconnected from <host>. Retrying…" plus a "Switch server" button that opens the ServerSelector dropdown.

**Rationale**: Today a failed connection is invisible — only the tiny colored dot in the header changes. Users don't associate "empty UI + red dot" with "my server is down, retry is happening." An explicit banner closes the recovery-visibility gap (layer 3 of the original bug).

**Threshold rationale**: 3s avoids flashing the banner during normal reconnects after laptop sleep / wifi hiccup (most recover in <2s); longer than that is a real problem worth showing.

### Decision 7: No banner for the staging switch itself

**Choice**: While a staging switch is in progress, show a small inline spinner on the clicked dropdown entry. Do NOT show the big connection banner — the live socket is still connected, nothing is actually broken.

**Rationale**: The banner is for "you are currently disconnected." During a staging switch, you are NOT disconnected. Conflating the two states confuses the user.

## Risks / Trade-offs

- **Risk**: Running two WebSocket connections simultaneously doubles authentication state briefly; the server's auth plugin must handle two concurrent sessions from the same browser. → **Mitigation**: Fastify/ws already supports this (sessions are per-connection, not per-origin); existing multi-tab behavior proves it. Verify in QA that auth plugin doesn't rate-limit or single-session-cap.

- **Risk**: State kept through a failed switch may include subscriptions that are now stale (e.g., if the user clicked switch then changed their mind mid-5s-timeout). → **Mitigation**: Live socket is never torn down on failure; existing subscriptions stay valid. Click-during-in-flight-switch: ignore the second click until the first resolves (visible via the inline spinner).

- **Risk**: Users who previously relied on the `/api/config POST { lastServer }` side-effect (unclear if any do) lose it. → **Mitigation**: Audit: `rg 'lastServer' packages/server/ packages/extension/` to confirm only read paths use it, and those read paths run on the machine that owns the config file — not via a remote browser write. If any consumer does depend on a remote browser writing this, we'll move it to a session-start event instead of a click event. Document this in tasks.md as an investigation task.

- **Trade-off**: 5-second timeout means a slow-to-handshake legitimate server is incorrectly reported as unreachable. → **Accepted**: remote servers in practice handshake in <1s; 5s already accommodates 5x margin. Toast includes the actual error so users can retry.

- **Trade-off**: Banner adds vertical space at the top of the UI when connection drops. → **Accepted**: this is the point — invisible failure is the bug we're fixing.

- **Trade-off**: Eager probing every 30s adds a handful of background fetches. → **Accepted**: negligible cost (≤5 entries × 1 fetch / 30s = 10 fetches/min in the worst case), and it replaces the current "the dot is lying to you" status.

## Migration Plan

- No user-facing migration needed. Existing `pi-dashboard-last-server` localStorage values remain valid and are read by `getInitialWsUrl` unchanged.
- If a user is currently soft-bricked (stuck on a dead localhost entry), the first successful switch via the new transactional flow will overwrite localStorage correctly. For the *very first* post-upgrade load, if their stored URL is already dead, the new banner will appear within 3 seconds and point them to the fix (open selector → pick a reachable server → success → localStorage updates).
- No server-side changes, no breaking API changes, no config changes.

## Open Questions

- Should the "Couldn't reach <host>" toast include a one-click "Retry" button, or just dismiss? (Leaning: no retry button initially — user can simply click the entry again. Add later if feedback calls for it.)
- Should the staging-switch inline spinner be in the dropdown entry or in the header button? (Leaning: dropdown entry, so the dropdown stays open and the user sees progress in context. Revisit in tasks.)
- Is `useWebSocket` currently reusable as a staging helper, or do we need a bespoke `useStagingWebSocket`? (Investigation task in tasks.md.)
