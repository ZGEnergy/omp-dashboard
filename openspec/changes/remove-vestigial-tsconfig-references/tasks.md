# Tasks

## 1. Remove vestigial references

- [ ] 1.1 Capture the baseline: run `npx tsc --noEmit` from repo root, confirm exit 0.
- [ ] 1.2 Delete the `references` array from `packages/client/tsconfig.json`.
- [ ] 1.3 Delete the `references` array from `packages/server/tsconfig.json`.
- [ ] 1.4 Delete the `references` array from `packages/extension/tsconfig.json`.
- [ ] 1.5 Delete the `references` array from `packages/dashboard-plugin-runtime/tsconfig.json`.
- [ ] 1.6 Delete the `references` array from `packages/dashboard-plugin-skill/tsconfig.json`.

## 2. Verify

- [ ] 2.1 Run `npx tsc --noEmit` from repo root, confirm still exit 0 (canonical check unchanged).
- [ ] 2.2 Run `npx tsc --noEmit -p packages/extension`, confirm TS6306 no longer fires.
- [ ] 2.3 Sanity-grep that no `references` arrays remain in `packages/*/tsconfig.json`: `grep -l '"references"' packages/*/tsconfig.json` → no output.
- [ ] 2.4 Confirm no `composite` / `tsc -b` was introduced (scope guard): `grep -rn 'composite\|tsc -b\|--build' packages/*/tsconfig.json tsconfig*.json package.json` → no new hits.
