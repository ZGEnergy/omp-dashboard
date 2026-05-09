## Why

The dashboard server has no process-level error handlers. Any unhandled promise rejection from any plugin kills the whole server. This actually fired on 2026-05-09: the `honcho` plugin's call to `https://api.honcho.dev` returned 404, the rejection escaped, and Node 25's default-exit-on-unhandled-rejection took the dashboard down. The crash stack contained only `@honcho-ai/core` frames — no plugin-userland frames — so the originating call site was unidentifiable from the log.

Every plugin is therefore a single-point-of-failure for the host process. As more plugins land (honcho, jj, flows-anthropic-bridge, future third-party plugins), the surface for this class of outage grows.

## What Changes

### Add process-level crash safety net (`packages/server/src/cli.ts`)

Add `installCrashSafetyNet()` registering `unhandledRejection` and `uncaughtException` handlers that:

- Log the offending stack with a stable `[crash-safety]` prefix so operators can grep `~/.pi/dashboard/server.log`.
- **Do not** call `process.exit()`. The server keeps running.

Called once from `main()` before any other init. Rationale: a single misbehaving plugin (honcho today, any plugin tomorrow) must not kill the host process. The daemon harness still restarts on real signal/exit-code crashes; this only covers async faults that Node would otherwise treat as fatal.

This is **not** "swallow all errors silently" — every suppressed fault is logged with full stack, so root-causing remains possible.

## Impact

- Affected specs: `dashboard-server` (resilience requirement).
- Affected code: `packages/server/src/cli.ts` — `installCrashSafetyNet()` added; `main()` calls it first.
- No client changes. No protocol changes. No new dependencies.

## Out of scope

- Identifying the exact honcho call site that emitted the rejection. Stack contained no userland frames; logging is now in place to capture it next time.
- Plugin sandboxing / VM isolation. Process-level handler is the minimal viable fix.
- The earlier suspected openspec-group regression turned out to be the running server holding stale code; commit `a131c1e2` had already re-landed the wiring on top of the `89860843` revert. A restart picked up current source — no code change needed.
