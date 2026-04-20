## 1. Implementation

- [x] 1.1 Add managed-install resolution path to `loadPiPackageManager()` in `packages/server/src/package-manager-wrapper.ts` — check `~/.pi-dashboard/node_modules/{@mariozechner,@oh-my-pi}/pi-coding-agent/dist/index.js` between the direct import and global npm fallback

## 2. Tests

- [x] 2.1 Add test: `loadPiPackageManager()` resolves from managed install when direct import fails (mock filesystem path)
- [x] 2.2 Add test: managed install miss falls through to global npm without error

## 3. Documentation

- [x] 3.1 Update AGENTS.md key files table if needed
