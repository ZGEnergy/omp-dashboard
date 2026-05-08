# Upstream Source

Lifted from [BlackBeltTechnology/pi-model-proxy](https://github.com/BlackBeltTechnology/pi-model-proxy), MIT licensed.

- **Commit:** 179d450 (v0.40.1)
- **Lift date:** 2026-05-07
- **pi-ai types version:** 0.73.0

## Local Divergences

1. **Type imports**: Upstream uses `import type { ... } from "@earendil-works/pi-ai"` — replaced with `any` since pi-ai is runtime-resolved. Local `types.ts` mirrors upstream's `../types.js` shapes.
2. **Tab → 2-space indentation**: Matches dashboard's `.editorconfig`.
3. **Lint**: Minor adjustments for dashboard's stricter `tsconfig` (no implicit any on some paths).
