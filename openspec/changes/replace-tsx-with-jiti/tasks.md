## 1. Jiti Loader Helper

- [x] 1.1 ~~Create shared resolver~~ — already shipped as `packages/shared/src/resolve-jiti.ts` (`resolveJitiImport()`)
- [x] 1.2 ~~Spawn-args helper~~ — call sites build argv inline; no separate helper needed
- [x] 1.3 ~~Tests~~ — covered by existing usage in extension + server daemon spawn

## 2. Server CLI Migration

- [x] 2.1 ~~Daemon spawn uses jiti~~ — already done at `packages/server/src/cli.ts:364` (`tsLoader = resolveJitiImport()`) with tsx fallback at `cli.ts:366-377`
- [ ] 2.2 Replace shebang at `packages/server/src/cli.ts:1` from `#!/usr/bin/env node --import tsx` to `#!/usr/bin/env node`
- [ ] 2.3 Create `packages/server/bin/pi-dashboard.mjs` — plain ESM wrapper that:
  - Calls `resolveJitiImport()` from `@blackbelt-technology/pi-dashboard-shared/resolve-jiti.js`
  - Falls back to tsx (mirroring `cli.ts:366-377`) when jiti unavailable
  - Re-execs `node --import <loader> <path-to-cli.ts> <args>`
  - Inherits stdio; forwards exit code

## 3. Extension Migration

- [x] 3.1 ~~Extension spawn uses jiti~~ — already done at `packages/extension/src/server-launcher.ts:104` (`resolveJitiImport()`)

## 4. Package Cleanup

- [ ] 4.1 Repoint `bin.pi-dashboard` in `packages/server/package.json` from `src/cli.ts` to `bin/pi-dashboard.mjs`
- [ ] 4.2 Add `bin/` to `files` array in `packages/server/package.json` if not already covered
- [x] 4.3 ~~Remove `tsx` from dependencies~~ — **out of scope**: tsx retained as fallback (see proposal Why)

## 5. Verification

- [ ] 5.1 Run full test suite (`npm test`)
- [ ] 5.2 Manually verify `pi-dashboard status` works through the new wrapper with pi on PATH
- [ ] 5.3 Manually verify `pi-dashboard status` falls back to tsx in a sandbox without pi
- [ ] 5.4 Verify extension auto-launch still works (`npm run reload`, confirm server starts)
