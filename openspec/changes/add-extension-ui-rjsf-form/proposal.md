## Why

Phase 4 of the Generalized Extension UI System (see design `extension-ui-system`). Adds a `rjsf-form` view type that renders user-supplied JSON Schema (`JSONSchema7`) via `react-jsonschema-form` with a Tailwind-themed widget set. This is the escape hatch for "anything richer than a fixed `UiField` form" — multi-step forms, conditional fields, nested objects, arrays of records, custom validation.

The motivating consumer is pi-judo's save/discard gate (currently uses TUI-only `ctx.ui.custom`); other use cases include any extension that needs a richer form UI than Phase 1's `UiField`-driven form view.

This change DEPENDS ON `add-extension-ui-modal` being shipped first. It is OPTIONAL — Phase 1 + Phase 2 together cover the majority of extension UI needs without RJSF.

## What Changes

- **NEW**: `rjsf-form` view type in `UiView.type` enum. Schema follows `JSONSchema7`; UI hints follow RJSF's `uiSchema` shape.
- **NEW**: Tailwind-themed RJSF widget set in `packages/client/src/components/extension-ui/rjsf-theme/` covering text/number/boolean/select/textarea/date/array/object widgets.
- **NEW**: Lazy-loaded RJSF bundle — RJSF (~150–200 KB minified) is dynamically imported only when a session has a module declaring `rjsf-form`. No eager cost for sessions without RJSF.
- **NEW**: Submit semantics — schema submission becomes a `ui_management { action: "submit", event, params: <validated form data> }`. Validation is RJSF's `ajv`-backed validation; client refuses to submit on validation error.
- **NEW**: Pure-pi fallback contract — extensions that opt into `rjsf-form` MUST declare a fallback strategy in the descriptor: `"ctx-ui"` (decompose into `ctx.ui.input` per top-level property, best-effort), `"defaults"` (return defaults synchronously without prompting the user), or `"reject"` (throw `NoDashboardError`). The bridge enforces this when no dashboard is connected.

## Capabilities

### New Capabilities

None — extends `extension-ui-system`.

### Modified Capabilities

- `extension-ui-system`: adds Requirements for the `rjsf-form` view type, RJSF lazy-load contract, validation semantics, and pure-pi fallback strategy.

## Impact

- `packages/client/package.json` — add `@rjsf/core`, `@rjsf/validator-ajv8` as dependencies (no theme package; we ship our own).
- `packages/client/src/components/extension-ui/rjsf-theme/` — new directory with widget components.
- `packages/client/src/components/extension-ui/GenericExtensionDialog.tsx` — render `rjsf-form` view type via dynamic import.
- `packages/shared/src/types.ts` — extend `UiView.type` enum; add `rjsfSchema`, `rjsfUiSchema`, `rjsfFallback` fields; update `DecoratorDescriptor` is unaffected.
- `packages/extension/src/bridge.ts` — handle `NoDashboardError` for `rjsf-form` modules with `fallback: "reject"`.

## References

- Design: `openspec/changes/extension-ui-system/design.md` §"RJSF: Phase 4, forms-only"
- RJSF: https://github.com/rjsf-team/react-jsonschema-form
- Phase 1: `openspec/changes/add-extension-ui-modal/`
- Phase 2: `openspec/changes/add-extension-ui-decorations/`
