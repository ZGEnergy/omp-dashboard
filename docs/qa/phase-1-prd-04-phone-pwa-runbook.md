# Phase 1 PRD 04: Dual-Instance Phone-PWA Web Push Runbook

## Scope and safety gate

This runbook validates opt-in Web Push from a disposable dashboard instance through a phone PWA.

- Production stays on `http://127.0.0.1:8088`.
- Treat `:8088` as read-only for this run.
- Never start, stop, restart, reconfigure, or repoint the `:8088` process.
- Never use production session URLs, production auth files, production bridge settings, or production push files for validation.
- Web Push over the existing PWA remains the only Phase 1 path in this runbook.
- No FCM, native, Capacitor, APNs, or permission-parity claim belongs in results.

### Port and origin map

| Resource | Validation value | Rule |
|---|---|---|
| Production dashboard | `http://127.0.0.1:8088` | Untouched. Health query only. |
| Validation HTTP + browser WebSocket | `http://127.0.0.1:8090` | Disposable server. |
| Phone PWA origin | `https://<validation-share>.share.zrok.io` | HTTPS zrok origin required. |
| Validation state | `$VALIDATION_HOME/.pi` | Preferred isolated state root. |

The phone must open the HTTPS zrok origin. `http://127.0.0.1:8090` serves local health checks; it does not provide a reachable phone origin. Web Push service-worker APIs require a secure context, and a phone cannot resolve host loopback.

## Preferred isolated harness

Use a temporary `HOME` for every disposable server, bridge, Pi session, and zrok command. This isolates dashboard config, locks, session files, bridge settings, push tokens, and VAPID keys.

```bash
export VALIDATION_HOME="$(mktemp -d "${TMPDIR:-/tmp}/pi-dashboard-pwa-XXXXXX")"
export HOME="$VALIDATION_HOME"
export PI_DASHBOARD_PORT=8090
mkdir -p "$HOME/.pi/dashboard"
```

Create validation-only config at `$HOME/.pi/dashboard/config.json`:

```json
{
  "port": 8090,
  "autoStart": false,
  "tunnel": { "enabled": false },
  "push": {
    "enabled": true,
    "webPush": { "contactEmail": "qa@example.invalid" }
  }
}
```

Use a disposable validation auth setup when the zrok origin requires authentication. Do not copy production `auth.json`, `settings.json`, or other files into the temporary `HOME`.

Start the validation server in the foreground. Keep the terminal and process identity visible:

```bash
npx tsx packages/server/src/cli.ts --port 8090 --no-tunnel
```

`--no-tunnel` prevents this server from owning a dashboard-managed tunnel. In a second terminal, set `VALIDATION_HOME` to the recorded temporary path, export the same `HOME`, and start a separate zrok share to the validation port:

```bash
export VALIDATION_HOME="/tmp/pi-dashboard-pwa-<recorded-suffix>"
export HOME="$VALIDATION_HOME"
zrok share public --headless http://127.0.0.1:8090
```

Record the emitted `https://<validation-share>.share.zrok.io` URL. Use that URL on the phone. Keep the zrok command in the foreground so teardown can interrupt this exact validation process. Use a disposable or approved validation zrok enrollment in the temporary `HOME`; never expose a production zrok share or token in notes.

Verify only the disposable endpoint before opening the phone:

```bash
curl -fsS http://127.0.0.1:8090/api/health
```

Expected result: validation health responds successfully on `:8090`. Do not replace `8090` with `8088` in validation commands.

### Validation session target

Create validation sessions through the validation dashboard's documented disposable-session mechanism. Verify the resulting session appears in the dashboard served through the validation zrok URL. A session connected to `:8088` cannot provide positive evidence for this run.

### Shared `~/.pi` risk mode

A shared-home run is a risk mode, not an isolated mode. It can collide with:

- locks;
- dashboard and Pi config;
- existing sessions and bridge settings;
- push-token registration;
- VAPID key files;
- zrok and other process state.

Use shared state only when the preferred temporary `HOME` harness cannot run. Keep `--port 8090` and `autoStart: false` explicit for the disposable server. Assume `$HOME/.pi/dashboard/push-tokens.json` and `push-vapid.json` are shared with other activity. Never describe this mode as isolated. Do not delete or rewrite shared files during cleanup. Stop the run and report contamination if a lock, config, session, token, or VAPID collision appears.

## Phone-PWA enrollment and transport check

1. Open the recorded HTTPS zrok URL on the phone. Do not use the production origin.
2. On iOS, install the site with **Share → Add to Home Screen** and open the installed PWA. A Safari tab does not receive this Web Push path.
3. Open **Settings** and locate the Web Push notifications section.
4. Select **Enable on this device**. Complete the browser's notification prompt when shown. Browser permission behavior remains user-agent behavior; this runbook does not compare permission behavior with another platform.
5. Confirm the control changes to **Disable on this device**.
6. Select **Send test notification**. This invokes `POST /api/push/test` for the current device token and targets a synthetic test session.
7. Confirm one notification arrives on the phone. Select it and verify that the opened URL stays on the validation HTTPS origin; this checks subscription registration, Web Push delivery, and origin routing only.

`/api/push/test` cannot prove navigation to a real disposable validation session. Keep the phone PWA installed and subscribed while running the event matrix below; all event-trigger and real-session navigation assertions must use the disposable validation sessions in that matrix.

If the section remains **Checking push support…** or reports unsupported, stop this run as an environment failure. Check the HTTPS zrok origin, installed-PWA requirement on iOS, validation `push.enabled`, and validation `webPush.contactEmail`. Do not enable or edit production push configuration to recover.

## Unviewed-session positive smoke preparation

Push and unread fan out only for a live notable event when **no browser on any device views the session**. Choose a disposable validation session with a visible card and a stable session ID.

Before each positive case:

1. Keep the session on the validation dashboard sidebar, not in its chat route.
2. Close the session detail on every desktop browser, phone PWA, and other dashboard client.
3. Confirm no client currently views the target session. A sidebar card or an unrelated session is safe.
4. Record the session ID and trigger family.
5. Generate the event through the validation bridge/session only.
6. Leave the target unviewed until the notification arrives.

Use a fresh session per trigger where possible. The default coalescing window is 30 seconds; wait longer than the configured window before repeating a trigger on the same `(session, device)` pair, or use another session ID.

### Trigger preparation matrix

| Case | Disposable-session preparation | Expected positive result |
|---|---|---|
| Core `ask` | Leave an active validation session unviewed. Cause the core `ask` input-needed event. | One link-only notification for that session. |
| `ask_user` | Leave a different active validation session unviewed. Cause the `ask_user` input-needed event. | One link-only notification for that session. |
| Turn done | Start a turn, then keep every client off the session while it transitions from streaming to idle/active. | One notification after turn completion. |
| Crash/error | Use a disposable session that produces `agent_end` with a truthy error. Keep it unviewed before the error event. | One error/attention notification with the validation session link. |

Use the existing project mechanism for producing each event. Do not synthesize a production event, edit production session files, or attach a validation bridge to `:8088`. Record trigger type, session ID, client-view state, and notification result without recording subscription endpoints or private VAPID material.

### Expected no-push cases

Any viewer suppresses fanout. One viewer on any client is sufficient:

1. Open the target validation session on a desktop browser or the phone PWA.
2. Keep that session visible while generating the same live trigger.
3. Expect no push and no new unread transition for that event.

This no-push result is correct. The gate checks whether **any** browser views the session, not whether the phone is the viewer. Replayed events after reconnect also do not produce a new push. Close every viewer before retrying a positive case.

## Negative production-untouched check

Run health queries before and after validation. Query production; do not manage it:

```bash
curl -fsS http://127.0.0.1:8088/api/health
curl -fsS http://127.0.0.1:8090/api/health
```

Expected results:

- `:8088` remains reachable and reports its normal health.
- `:8090` reports the disposable validation instance.
- The phone URL resolves to the zrok share targeting `:8090`, never `:8088`.
- Positive notifications link back to the validation origin/session.
- No validation command uses `pi-dashboard stop`, `pi-dashboard restart`, `/api/shutdown`, `/api/restart`, or a production `PI_DASHBOARD_URL`.

A production health failure is a stop condition for this run. Do not attempt recovery by stopping, restarting, or repointing the production process. Report the validation result and the observed health failure.

## Validation-scoped teardown

Complete teardown only after recording the matrix and health checks.

### Preferred isolated mode

1. Disable the subscription from the validation origin with **Disable on this device**. This removes only the validation-origin browser subscription.
2. End validation sessions from the validation dashboard. Leave production sessions alone.
3. Press `Ctrl-C` in the terminal running the foreground validation server on `:8090`.
4. Press `Ctrl-C` in the terminal running the validation zrok share. Do not use broad `pkill` or process-name cleanup.
5. Remove only the temporary validation home after both validation processes exit:

   ```bash
   rm -rf "$VALIDATION_HOME"
   ```

6. Close the validation PWA/browser tabs. Remove the validation-origin home-screen icon only when required by the device test plan.

### Shared-home risk mode

Stop only the exact foreground `:8090` server and exact validation zrok process. Do not delete, rewrite, or reset shared `~/.pi` files. Do not unregister an unknown token, rotate a shared VAPID key, or run broad process cleanup. Leave shared state for an owner to inspect and report any contamination. Production `:8088` remains untouched throughout teardown.
