## Why

The project uses Vite 6 with the dual esbuild+Rollup pipeline and `@vitejs/plugin-react` v4 (Babel-based). Vite 8 (released March 2026) replaces this with a single Rust-based Rolldown bundler and Oxc transforms, delivering 10-30x faster production builds. The new `@vitejs/plugin-react` v6 drops Babel entirely in favor of Oxc, making `@vitejs/plugin-react-swc` unnecessary. Upgrading now keeps us on the supported path and eliminates the Babel dependency.

## What Changes

- **BREAKING**: Bump `vite` from `^6.0.0` to `^8.0.0` — Rolldown replaces esbuild+Rollup
- **BREAKING**: Bump `@vitejs/plugin-react` from `^4.0.0` to `^6.0.0` — Oxc replaces Babel for React Refresh
- Bump `vitest` to a Vite 8-compatible version (likely `^4.0.0`)
- Verify `@tailwindcss/vite` `^4.0.0` compatibility with Vite 8
- No `vite.config.ts` changes expected — our config uses no esbuild/rollupOptions customizations
- CJS interop behavior changes (unlikely to affect us — we use ESM throughout)

## Capabilities

### New Capabilities

_(none — this is a dependency upgrade, not a feature change)_

### Modified Capabilities

_(none — no spec-level behavior changes, only build tooling internals)_

## Impact

- **Dependencies**: `vite`, `@vitejs/plugin-react`, `vitest` major version bumps; Babel removed from dependency tree
- **Build pipeline**: Rolldown (Rust) replaces esbuild+Rollup; Oxc replaces Babel for JSX transforms
- **Install size**: Net smaller — dropping Babel offsets the slightly larger Rolldown binary + lightningcss
- **CI/CD**: Build commands unchanged (`npm run build`, `npm run dev`), but build times should improve
- **Risk**: Low — our `vite.config.ts` is minimal with no custom bundler options; Vite 8 auto-converts deprecated config
