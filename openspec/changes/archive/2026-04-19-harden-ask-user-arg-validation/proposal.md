# Harden ask_user Argument Validation

## Problem

The `ask_user` tool silently accepts malformed arguments from the LLM and presents an unusable dialog in the dashboard (title "Question", no options, only a Cancel button). The user has no way to answer; the tool returns `"User responded: undefined"`; the LLM often retries with the same mistake and wastes turns.

Observed in session `fix-node-pty-permissions-and-handler-errors` (jsonl line 244):

```json
{
  "name": "ask_user",
  "arguments": {
    "method": "select",
    "params": "{\"question\": \"Sync delta specs...\", \"options\": [\"Sync now...\", \"Archive without syncing...\"]}"
  }
}
```

The model wrapped `question` and `options` inside a stringified `params` field instead of using top-level `title`/`options`. The tool's TypeBox schema doesn't declare `params`, so the extra key is ignored; `title` and `options` come through as `undefined`; `ask-user-tool.ts` falls back to `title = "Question"` and `options = []`; `ctx.ui.select("Question", [], undefined)` produces a prompt the user cannot answer. The same mistake occurred twice in the same session.

## Root Cause

Two gaps, both in `packages/extension/src/ask-user-tool.ts`:

1. **No validation that `options` is non-empty for `select`/`multiselect`.** The parameter schema marks `options` as `Optional`, so the SDK happily validates `{method:"select"}` and the tool proceeds with an empty array.
2. **No rescue for the `{method, params:"{…}"}` wrapping mistake.** There is already a rescue path that parses `options` when it arrives as a JSON string (`prepareArguments`). That pattern works but doesn't cover the wrapped shape the LLM actually emits.

## Proposed Fix

**Schema tightening (primary defense — stops the bad call before `execute` runs).** Replace the flat `Type.Object` with a discriminated union so the SDK/LLM sees `options` as required for `select`/`multiselect`:

```
Type.Union([
  Type.Object({ method: Type.Literal("confirm"), title: Type.String(), message: Type.Optional(Type.String()) }),
  Type.Object({ method: Type.Literal("select"),
                title: Type.String(),
                options: Type.Array(Type.String(), { minItems: 2 }),
                message: Type.Optional(Type.String()) }),
  Type.Object({ method: Type.Literal("multiselect"),
                title: Type.String(),
                options: Type.Array(Type.String(), { minItems: 1 }),
                message: Type.Optional(Type.String()) }),
  Type.Object({ method: Type.Literal("input"),
                title: Type.String(),
                placeholder: Type.Optional(Type.String()),
                message: Type.Optional(Type.String()) }),
])
```

Malformed calls are rejected by the SDK's tool validator; the LLM sees a structured error and corrects itself.

**Defensive rescue in `prepareArguments` (secondary defense — repairs common shapes that slip past validation).** Extend the existing rescue logic to:

- Unwrap `{method, params: "<json>"}` → merge parsed fields into args.
- Unwrap `{method, params: {...}}` (object form) → same.
- Rename `question` → `title` when `title` is absent.

Rescue runs before schema validation, so repaired args validate cleanly.

**Runtime refusal for still-empty `options`.** If rescue + validation somehow still produce a `select`/`multiselect` call with an empty `options` array (e.g. provider bypasses schema), `execute` throws a clear error instead of presenting an unusable dialog.

## Scope

- `packages/extension/src/ask-user-tool.ts` — discriminated union schema, expanded `prepareArguments` rescue, empty-options guard in `execute`
- `packages/extension/src/__tests__/ask-user-tool.test.ts` — tests for new rescue paths, schema rejection, empty-options guard

No changes required on the server, client, or shared protocol. No rebuild of client/server. Ships via `npm run reload`.

## Alternatives Considered

1. **Silent rescue only.** Hides the LLM mistake forever; future weird shapes need more rescue code. Rejected as sole fix.
2. **Runtime throw only, no schema change.** Forces a wasted turn every time the LLM gets it wrong. Rejected as sole fix — schema is the right layer.
3. **Client-side graceful dialog (fallback input when `options` empty).** Papers over the real bug and hides telemetry. Rejected.
4. **Leave the schema flat and only add rescue.** Less effective — the LLM learns nothing and keeps emitting the wrapped shape. Rejected.

## Complexity

Low. ~30 lines of change in one file plus tests. No architectural changes, no protocol changes, no client/server rebuild.
