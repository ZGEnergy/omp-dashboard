## 1. Jiti Loader Helper

- [ ] 1.1 Create `src/shared/jiti-loader.ts` with `resolveJitiRegisterPath()` — tries `import.meta.resolve` first, falls back to `which pi` + symlink traversal
- [ ] 1.2 Add `getJitiImportArgs(scriptPath)` that returns `["--import", jitiPath, scriptPath]`
- [ ] 1.3 Write tests for both resolution strategies and the error case

## 2. Server CLI Migration

- [ ] 2.1 Remove shebang from `src/server/cli.ts` (no longer a direct entry point)
- [ ] 2.2 Update daemon spawn in `src/server/cli.ts` to use `getJitiImportArgs()` instead of `["--import", "tsx", ...]`
- [ ] 2.3 Create `bin/pi-dashboard.mjs` — plain JS wrapper that resolves jiti and re-execs node with cli.ts

## 3. Extension Migration

- [ ] 3.1 Update `src/extension/server-launcher.ts` spawn to use `getJitiImportArgs()` instead of `["--import", "tsx", ...]`

## 4. Package Cleanup

- [ ] 4.1 Update `package.json` bin entry to point to `bin/pi-dashboard.mjs`
- [ ] 4.2 Remove `tsx` from dependencies in `package.json`
- [ ] 4.3 Add `bin/` to the `files` array in `package.json` if not already included

## 5. Verification

- [ ] 5.1 Run full test suite
- [ ] 5.2 Manually verify `pi-dashboard status` works with jiti loader
- [ ] 5.3 Verify extension server auto-launch works (reload pi session, confirm server starts)
