# extension-ui-system Specification

## Purpose

Stub created by change `extension-ui-system` (design-only proposal). The capability covers a generalized, schema-driven mechanism for extensions to declare UI surfaces (modal management dialogs and live in-page decorations) that the dashboard renders in a bounded set of named slots, with no extension-authored React or runtime SDK required.

Replace this Purpose section and add Requirements once the first implementation change (`add-extension-ui-modal`) is archived. The design that motivates this capability lives in `openspec/changes/extension-ui-system/design.md`.

## Requirements

TBD — the design-only change `extension-ui-system` does not introduce runtime requirements. Phase 1 implementation lands in `add-extension-ui-modal` and Phase 2 in `add-extension-ui-decorations`; their archives will populate this section.

## Related Capabilities

- `interactive-ui-dialogs` — handles `ctx.ui.*` one-shot prompts (orthogonal: PromptBus is request/response; this capability is push-based descriptors).
- `ui-proxy` — wraps `ctx.ui.*` calls in the bridge for dashboard forwarding (orthogonal: same boundary, different mechanism).
- `extension-ui-forwarding` — historical placeholder for catch-all event-bus forwarding (this capability supersedes it for declarative UI; raw event-forwarding remains for arbitrary extension events).
- `pi-resource-scanner` — discovers extensions on disk; this capability operates on extensions already loaded in a pi session, after their UI listeners have registered.
