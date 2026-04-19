# Design: Harden ask_user Argument Validation

## Current flow

```
LLM ──┐
      │ tool_call(ask_user, arguments)
      ▼
pi-ai SDK
      │   1. validate arguments against TypeBox schema
      │      (currently: flat Object, options Optional → accepts {method:"select"})
      │   2. call tool.prepareArguments(args)   ← rescue hook
      │   3. call tool.execute(id, params, …)
      ▼
ask-user-tool.execute
      │   title   = params.title || params.message || "Question"
      │   options = Array.isArray(params.options) ? params.options : []
      ▼
ctx.ui.select(title, options, msgOpts)
      │
      ▼  PromptBus → dashboard → SelectRenderer
      (empty options → user sees "Question" + Cancel only)
```

## Proposed flow

```
LLM ──┐
      │ tool_call(ask_user, arguments)
      ▼
pi-ai SDK
      │   1. call tool.prepareArguments(args)    ← now also unwraps {method,params:…}
      │   2. validate against TypeBox Union       ← discriminated on method
      │         • select/multiselect require title + non-empty options
      │         • input/confirm require title
      │         • invalid shapes REJECTED → LLM sees structured error → retries
      │   3. call tool.execute(id, params, …)
      ▼
ask-user-tool.execute
      │   (params already validated; still double-checks options non-empty
      │    for select/multiselect as defense-in-depth)
      ▼
ctx.ui.select(title, options, msgOpts)
```

Note: whether `prepareArguments` runs before or after schema validation depends on the pi-ai SDK. If it runs after, rescue alone cannot repair a call that fails validation; we rely on the schema being the right shape. The rescue still helps for edge cases where providers are lenient or where a future tool call arrives via a path that skips validation.

## Schema shape

```ts
// packages/extension/src/ask-user-tool.ts
const ConfirmParams = Type.Object({
  method: Type.Literal("confirm"),
  title: Type.String({ description: "Yes/no question" }),
  message: Type.Optional(Type.String({ description: "Additional context" })),
});

const SelectParams = Type.Object({
  method: Type.Literal("select"),
  title: Type.String({ description: "Short title for the question" }),
  options: Type.Array(Type.String(), {
    minItems: 2,
    description: "Options the user chooses between (at least 2)",
  }),
  message: Type.Optional(Type.String()),
});

const MultiselectParams = Type.Object({
  method: Type.Literal("multiselect"),
  title: Type.String(),
  options: Type.Array(Type.String(), { minItems: 1 }),
  message: Type.Optional(Type.String()),
});

const InputParams = Type.Object({
  method: Type.Literal("input"),
  title: Type.String(),
  placeholder: Type.Optional(Type.String()),
  message: Type.Optional(Type.String()),
});

const AskUserParams = Type.Union(
  [ConfirmParams, SelectParams, MultiselectParams, InputParams],
  { discriminator: { propertyName: "method" } },
);
```

## prepareArguments rescue

Extend the existing function so that — before validation — it normalizes three known shapes:

| Incoming shape | Repair |
|---|---|
| `{method, options: "<json string>"}` | parse → array (existing behavior) |
| `{method, params: "<json string>", …}` | parse `params`, merge into args (new) |
| `{method, params: {…}, …}` | spread params into args (new) |
| `{method, question, …}` (no `title`) | copy `question` into `title` (new) |

Ordering: strip/unwrap `params` first, then rename `question`→`title`, then repair `options` string.

## Defensive guard in `execute`

```ts
if ((params.method === "select" || params.method === "multiselect")
    && (!Array.isArray(options) || options.length === 0)) {
  throw new Error(
    `ask_user: method "${params.method}" requires a non-empty "options" array. ` +
    `Received: ${JSON.stringify(params.options)}. ` +
    `Did you mean method "input"?`
  );
}
```

Thrown errors surface to the LLM as the tool result, producing a clear corrective signal instead of a silent "User responded: undefined".

## Backward compatibility

- All existing correct calls (`{method, title, options}`) continue to validate.
- The existing `ask-user-message-body` spec scenarios (message passed through for all methods) remain satisfied — `message` is still `Optional` on every branch.
- Existing test `ask-user-tool.test.ts` expects `options: []` to be passed through for `select`; this test must be updated to reflect the new refusal behavior (or use `input` method for that scenario).

## Risks

- **Discriminator support in TypeBox/ajv.** Some validator configurations don't strictly enforce discriminator semantics. If the SDK's validator accepts a `SelectParams` without `options` due to loose union matching, we rely on the `execute` guard as the final line of defense. Mitigated by explicit test against a malformed payload.
- **`prepareArguments` ordering in pi-ai SDK.** If rescue runs after validation, rescue is pure defense-in-depth and never needed in the happy path. Still valuable for non-SDK callers.
- **Overly strict `minItems: 2`** on `select`. A single-option select is nonsensical, but if a tool ever needs it, we can lower to 1. Deliberate choice to teach the LLM that `select` with one option should be a `confirm`.
