## 1. Dependency Upgrades

- [x] 1.1 Bump `vite` from `^6.0.0` to `^8.0.0` in package.json
- [x] 1.2 Bump `@vitejs/plugin-react` from `^4.0.0` to `^6.0.0` in package.json
- [x] 1.3 Bump `vitest` to Vite 8-compatible version in package.json
- [x] 1.4 Verify `@tailwindcss/vite` `^4.0.0` works with Vite 8; bump if needed
- [x] 1.5 Run `npm install` and resolve any peer dependency conflicts

## 2. Verification

- [x] 2.1 Run `npm test` and verify all tests pass
- [x] 2.2 Run `npm run build` and verify production build succeeds
- [x] 2.3 Run `npm run dev` and verify dev server starts with HMR working (manual)
- [x] 2.4 Compare build output size and time against baseline (8s, 1.7MB main chunk)

## 3. Cleanup

- [x] 3.1 Remove any leftover esbuild/Babel references if present in config or dependencies (none found)
- [x] 3.2 Update AGENTS.md and docs if build tooling documentation references Vite 6 (no version-specific refs found)
