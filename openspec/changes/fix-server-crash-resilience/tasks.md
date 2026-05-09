# Tasks

## 1. Add process-level crash safety net

- [x] 1.1 Add `installCrashSafetyNet()` to `packages/server/src/cli.ts` registering `unhandledRejection` + `uncaughtException` handlers that log with `[crash-safety]` prefix and never call `process.exit`.
- [x] 1.2 Invoke `installCrashSafetyNet()` as the first statement in `main()`.
- [x] 1.3 Restart server; confirm `/api/health` returns 200 and no exit-on-rejection occurs.
