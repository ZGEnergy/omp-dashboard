## Why

Extensions today have only two ways to surface UI in pi:

- `ctx.ui` dialog primitives (`confirm`, `select`, `input`, `editor`, `notify`) — already proxied to the dashboard via the PromptBus / ui-proxy.
- `pi-tui` widgets (cards, footer segments, breadcrumbs, gates, custom overlays) — TUI-only; the dashboard ignores or partially mirrors them.

Real-world extensions like pi-judo register rich TUI surfaces (`flow:register-card`, `register-footer-segment`, `register-workflow`, `register-gate`, `ctx.ui.custom`) that have no equivalent in the dashboard. As more extensions adopt pi-flows and want richer dashboard rendering, every new TUI primitive becomes a one-off dashboard spec, growing tightly-coupled per-feature code in `FlowAgentCard`, `FlowDashboard`, `SessionHeader`. The cost is `O(features × extensions)`.

A generalized extension UI system flips this to `O(features)`: extensions describe their UIs as data and the dashboard hosts them in a bounded set of named slots. Extensions stay pi-runnable when no dashboard is connected; the dashboard adds new slot types without per-extension React work.

PR #15 ("Generalized Extension UI System / Hybrid Schema") prototyped one slice of this (slash-command modal) on a stale baseline. This proposal **rebuilds the mechanism on current `develop`** and **extends the slot taxonomy** to cover live decorations beyond modal dialogs. PR #15 itself is not merged; it is a reference implementation whose lessons inform this design.

**Relationship to `dashboard-plugin-architecture`.** This proposal covers the *third-party descriptor* tier: how extensions emit data and how it lands in descriptor-renderable slots. The companion proposal `dashboard-plugin-architecture` covers the *first-party plugin* tier (React-shipping monorepo packages like the planned `openspec-plugin` and `flows-plugin`) and the unified slot taxonomy both tiers target. Read the umbrella for the broader picture; read this one for the descriptor-protocol details.

## What Changes

- **NEW**: Pull-based discovery primitive — bridge emits `ui:list-modules` on session start; extensions push descriptor schemas into the probe object. No SDK package import required.
- **NEW**: Bounded slot taxonomy — modules declare a `kind`; the dashboard renders each kind in a fixed React slot.
  - **Phase 1**: `management-modal` (table / grid / form views, slash-command-triggered)
  - **Phase 2**: `footer-segment`, `agent-metric`, `breadcrumb`, `gate`, `toast`, `settings-section` (descriptor variant: a `UiField`-driven form rendered in the dashboard's Settings page; persists to `plugins.<namespace>.*`)
  - **Phase 4** (optional): `rjsf-form` (JSON Schema escape hatch for rich forms; also enables a richer `settings-section` variant via JSON Schema instead of `UiField`)
- **NEW**: Schema types in `@blackbelt-technology/pi-dashboard-shared` — `ExtensionUiModule`, `UiView`, `UiField`, `UiAction`, `UiSection`, plus per-kind decoration descriptor types.
- **NEW**: Wire protocol additions:
  - `ui_modules_list` (extension → server → browser): cached schemas
  - `ui_data_list` (extension → server → browser): table data
  - `ui_management` (browser → server → extension): action / data request
  - `ext_ui_decorator` (Phase 2, single-union): live-decoration descriptors
- **NEW**: Server-side replay — server caches last `ext_ui_decorator` per `(sessionId, kind, namespace, id)` and replays on subscribe.
- **NEW**: Invalidate primitive — extensions emit `ui:invalidate { id }` to trigger re-probe of a specific module.
- **NEW**: pi-flows adopts the system (Phase 3, separate change in pi-flows repo) — listens for `ui:list-modules` and pushes descriptors for its workflows, gates, and registered cards. Flow-using extensions get dashboard surfaces for free.
- **NOT INTRODUCED**: a separate `@blackbelt-technology/pi-dashboard-sdk` package — types live in `pi-dashboard-shared`; extensions do not import a runtime SDK.

This change is **design-only**. Implementation lands in subsequent change folders, one per phase.

## Capabilities

### New Capabilities

- `extension-ui-system`: pull-based discovery, bounded slot taxonomy, schema descriptors, wire protocol, server-cached replay, and no-dashboard fallback semantics for extension-declared UIs.

### Modified Capabilities

None. This change is purely additive. Existing `interactive-ui-dialogs`, `ui-proxy`, and `extension-ui-forwarding` capabilities remain unchanged.

## Impact

- `packages/shared/src/types.ts` — new schema types (Phase 1) and decorator descriptor union (Phase 2)
- `packages/shared/src/protocol.ts` and `browser-protocol.ts` — new message types per phase
- `packages/extension/src/bridge.ts` — `refreshUiModules()` on session start, `ui_management` routing, `ui:invalidate` listener
- `packages/server/src/event-wiring.ts` — `ext_ui_decorator` replay cache (Phase 2)
- `packages/server/src/browser-handlers/subscription-handler.ts` — replay on subscribe (Phase 2)
- `packages/client/src/components/extension-ui/` — new directory; one component per slot kind
- `packages/client/src/components/SessionHeader.tsx` — slash-command → modal dispatch
- `pi-flows` (external repo) — Phase 3 adoption (separate change in pi-flows)
- `pi-judo` (external repo) — Phase 1 + Phase 2 consumer migration (separate change)

Implementation phases are tracked as follow-up changes:

```
1. extension-ui-system               ← THIS (design only)
2. add-extension-ui-modal            ← Phase 1: management-modal slot
3. add-extension-ui-decorations      ← Phase 2: footer-segment, agent-metric,
                                       breadcrumb, gate, toast
4. pi-flows-adopt-extension-ui       ← Phase 3 (in pi-flows repo)
5. pi-judo-adopt-extension-ui        ← Phase 3 consumer (in pi-judo repo)
6. add-extension-ui-rjsf-form        ← Phase 4 (optional, JSON Schema)
```
