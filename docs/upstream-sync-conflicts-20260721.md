# Upstream sync conflicts (20260721)

- upstream: develop@5a06c24d
- base: main@a5eb0ef6
- branch: sync/upstream-develop-resolution

## Remaining unmerged paths (manual)

- `package-lock.json` → manual
- `package.json` → manual
- `packages/extension/package.json` → manual
- `packages/extension/src/bridge.ts` → manual
- `packages/server/package.json` → manual
- `packages/server/src/server.ts` → manual

## Policy
- **protected** paths → `--ours` (ZGE deploy/push/OMP/tooling)
- **semantic hubs** (`server.ts`, `bridge.ts`, `config.ts`, package manifests) → combine both sides
- **everything else** already took `--theirs` (prefer upstream same-intent product code)
- re-run: scripts/upstream-sync.sh verify
