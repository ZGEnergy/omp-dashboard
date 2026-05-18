# Manual QA: streamline-electron-bootstrap-and-recovery

## Scope

6 remaining tasks. 14.1 / 14.2 / 14.3 cover five-scenario smoke per platform. 16.A.5 / 16.D.6 / 16.E.4 cover three integration smokes (macOS-only). Deferred from automated CI. Need real `.app` build plus install on user machine.

## Build

- macOS: `cd packages/electron && npm run build:local` → `.dmg` in `out/make/`
- Linux: `cd packages/electron && npm run build:local` → `.AppImage` + `.deb` in `out/make/`
- Windows: `cd packages/electron && npm run build:local` → NSIS `.exe` in `out/make/`

## Common prep

```bash
# Clean state — run before each scenario unless noted
rm -rf ~/.pi-dashboard/ ~/.pi/dashboard/
```

## Scenarios — five per platform

### Scenario A — Fresh install

- Setup: `rm -rf ~/.pi-dashboard/ ~/.pi/dashboard/`
- Action: install platform artifact, launch app
- Pass: wizard appears (4 steps: welcome / select packages / progress / done). Completes without error. Dashboard loads at http://localhost:8000/. Session list works.
- Check log: `tail ~/.pi/dashboard/server.log | grep '\[preflight\] runPreflight'` shows `totalMs<500`
- Check audit: `tail ~/.pi-dashboard/doctor.log` shows one `{"operation":"wizard.install","outcome":"ok",...}` entry

### Scenario B — Upgrade install

- Setup: keep `~/.pi-dashboard/` populated. Plant legacy `mode.json`: `echo '{}' > ~/.pi-dashboard/mode.json`
- Action: install new artifact over old one, launch app
- Pass: server log line `[bootstrap] legacy state cleanup removed=mode.json`. Dashboard loads. Preflight diff in log matches actual inventory.

### Scenario C — Package corruption

- Setup: after Scenario A succeeds, `rm ~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent/package.json`. Quit and relaunch app.
- Pass: app lands on loading page with diagnosis row `Corrupt: pi-coding-agent ...`. `Reinstall managed packages` button visible. Click → dashboard recovers. Audit log shows `{"operation":"loading-page.reinstall","outcome":"ok"}` entry.

### Scenario D — Version skew

- Setup: after Scenario A, edit `~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent/package.json`. Change `version` to `"0.0.1"`. Quit and relaunch.
- Pass: preflight detects stale. Reinstall dialog appears (runs silent if `PI_DASHBOARD_SILENT_BOOTSTRAP=1`). Audit log shows `{"operation":"preflight.reinstall","outcome":"ok"}`.

### Scenario E — Force reinstall with user package

- Setup: after Scenario A, `~/.pi-dashboard/node_modules/.bin/pi --install npm:pi-model-proxy` (or via dashboard Settings → Packages → Install)
- Action: open Doctor → expand `Danger zone`. Audit panel shows wipe paths exclude `pi-model-proxy`. Click `Force reinstall`. Confirm dialog.
- Pass: force reinstall completes. `pi-model-proxy` still present at `~/.pi-dashboard/node_modules/`. Whitelist entries rewritten. Audit log shows `{"operation":"doctor.force-reinstall","outcome":"ok","details":{"wiped":N,"preserved":M}}`.

## Per-platform notes

### 14.1 macOS

Run A–E in order. Plus three macOS-only integration smokes below.

### 14.2 Linux

Run A–E on `.AppImage`. Repeat on `.deb` separately.

### 14.3 Windows

Run A–E on NSIS `.exe`. Symlink note: shipped bundle ships symlink-free. `.cmd` shim or junction under `~/.pi-dashboard/node_modules/@blackbelt-technology/` reflects npm handling. Acceptable.

## Integration smokes (macOS-only, optional elsewhere)

### 16.A.5 — Re-materialization after npm-install wipe

```bash
# Fresh-extract → bootstrap install → curl client
rm -rf ~/.pi-dashboard/{.version,node_modules,package.json,package-lock.json,packages}
open /Applications/PI-Dashboard.app
sleep 20
ls ~/.pi-dashboard/node_modules/@blackbelt-technology/   # MUST list 5 entries
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/   # MUST be 200
```

### 16.D.6 — Two-Electron-instance race

```bash
open /Applications/PI-Dashboard.app
sleep 5
open /Applications/PI-Dashboard.app
# Second instance MUST detect running=true (NOT "port in use")
grep 'Pre-wizard health check' ~/Library/Logs/PI-Dashboard/main.log | tail -2
# Second line MUST show: running=true portConflict=false pid=...
```

### 16.E.4 — Watchdog respawn

```bash
open /Applications/PI-Dashboard.app
sleep 15
PID=$(lsof -nP -iTCP:8000 -sTCP:LISTEN -t | head -1)
kill -TERM $PID
sleep 3
# Electron window MUST show loading.html with "Cannot connect" + recovery affordances
# Server log MUST contain:
#   [server-lifecycle] server child exited unexpectedly code=null signal=SIGTERM — routing to recovery
```

## Acceptance summary

All 6 manual tasks pass → archive change with `/opsx-archive streamline-electron-bootstrap-and-recovery`. Any failure → log in change's `design.md` tech-debt section. Re-open relevant sub-group.

## Failure mode reference

Maps to `docs/electron-bootstrap-flow.md § Common failure modes`:

1. Scope-dir wipe → 16.A.5
2. Client static-file → Scenario C and 16.A.5 (curl returns 200)
3. Wrong server.log → Scenarios A / B / C — confirm `~/.pi/dashboard/server.log` carries fresh content, not `~/.pi-dashboard/server.log`
4. Pre-wizard probe timeout → 16.D.6
5. Watchdog → 16.E.4
