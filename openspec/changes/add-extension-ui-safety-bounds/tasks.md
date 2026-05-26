# Tasks

## 1. Bound constants

- [ ] 1.1 Create `packages/shared/src/extension-ui-bounds.ts` exporting `EXT_UI_BOUNDS` (decorator key cap, per-field caps, JSON-size cap). Single source of truth.
- [ ] 1.2 Export from `@blackbelt-technology/pi-dashboard-shared` barrel.

## 2. Bridge enforcement

- [ ] 2.1 In `ui-modules.ts:refreshUiModules`, after partitioning entries by kind, run a `validateAndTruncate(entry)` pass. Truncate over-limit string fields; warn once per `(module.id|cache-key, field)`.
- [ ] 2.2 Compute descriptor JSON size via `JSON.stringify(descriptor).length`. If > 64 KB, drop the descriptor entirely with a warning naming the cache key.
- [ ] 2.3 Track per-session decorator-key count locally in the bridge (since the server owns the cache). On the local count exceeding 256, drop new descriptors with a warning until existing ones are removed via `removed: true`.

## 3. Server enforcement (defense in depth)

- [ ] 3.1 In `event-wiring.ts:ext_ui_decorator` handler, re-validate JSON size and per-field caps. Truncate on overflow; reject on JSON-size violation.
- [ ] 3.2 Before writing `session.uiDecorators[key] = descriptor`, check `Object.keys(session.uiDecorators ?? {}).length`. If ≥ 256 and the key is new, reject + warn. Updates to existing keys always succeed.

## 4. Client cosmetic guard

- [ ] 4.1 Add `max-w-[200px] truncate` to `FooterSegmentSlot` text rendering as a defense-in-depth visual cap. Tooltip retains full (already-truncated) value.
- [ ] 4.2 Add `line-clamp-2` to toast messages.

## 5. Tests

- [ ] 5.1 Bridge: 201-char `footer-segment.text` is truncated to 199 chars + `…`. One warning per `(cache-key, "text")` pair.
- [ ] 5.2 Bridge: 65 KB descriptor is rejected with named warning.
- [ ] 5.3 Bridge: pushing 257 distinct decorator keys produces 256 forwards and 1 rejection.
- [ ] 5.4 Server: validates and re-truncates if bridge missed a field (regression guard for older bridges).
- [ ] 5.5 Server: 257th distinct cache key rejected; existing-key updates still pass.

## 6. Documentation

- [ ] 6.1 Document bound constants in `docs/architecture.md` "Extension UI System" section.
- [ ] 6.2 Add a "Limits" subsection to `dashboard-plugin-skill` references so scaffolded extensions show the cap values.
