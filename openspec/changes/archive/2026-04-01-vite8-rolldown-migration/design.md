## Context

The project uses Vite 6 (esbuild + Rollup dual pipeline) with `@vitejs/plugin-react` v4 (Babel-based). Vite 8 ships Rolldown as the single Rust-based bundler and `@vitejs/plugin-react` v6 uses Oxc instead of Babel. Our `vite.config.ts` is minimal — React plugin, Tailwind CSS v4 plugin, proxy config — with no custom esbuild or Rollup options.

Current build: ~8s for production client bundle.

## Goals / Non-Goals

**Goals:**
- Upgrade to Vite 8 with Rolldown bundler
- Switch to `@vitejs/plugin-react` v6 (Oxc-based, no Babel)
- Ensure vitest compatibility with Vite 8
- Verify all existing tests pass
- Maintain identical dev and build behavior

**Non-Goals:**
- Adopting Vite 8 experimental features (Full Bundle Mode, devtools)
- Switching to `@vitejs/plugin-react-swc` (Oxc in v6 makes SWC unnecessary)
- Optimizing chunk splitting with Rolldown's `codeSplitting` API
- Upgrading to `build.rolldownOptions` syntax (auto-compat handles our config)

## Decisions

### 1. Direct upgrade to Vite 8 (skip rolldown-vite intermediate step)

Our config is minimal with no custom bundler options. The gradual migration via `rolldown-vite` package on Vite 7 is unnecessary complexity. If issues arise, they'll be easy to isolate given our simple setup.

**Alternative**: Two-step migration (Vite 6 → rolldown-vite on v7 → Vite 8). Rejected as over-engineering for our case.

### 2. Use `@vitejs/plugin-react` v6 instead of `@vitejs/plugin-react-swc`

v6 uses Oxc natively for React Refresh transforms — same speed tier as SWC but officially supported and maintained by the Vite team. Adding SWC would be an extra dependency with no benefit.

### 3. Bump vitest to Vite 8-compatible version

Vitest needs to support the Vite 8 peer dependency. Check latest vitest release for compatibility.

## Risks / Trade-offs

- **[CJS interop changes]** → Mitigation: We use ESM throughout; unlikely to affect us. If a dependency breaks, `legacy.inconsistentCjsInterop: true` is a temporary escape hatch.
- **[CSS minification changes]** → Mitigation: Lightning CSS is now default; may cause minor CSS size differences. Visual regression testing via manual spot-check.
- **[Plugin compatibility]** → Mitigation: `@tailwindcss/vite` v4 needs verification. If incompatible, check for a newer release.
- **[Vitest version jump]** → Mitigation: Vitest major bumps may have their own breaking changes in test APIs. Run full test suite after upgrade.
