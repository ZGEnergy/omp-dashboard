## 1. Update ask_user tool schema and execute

- [x] 1.1 In `ask-user-tool.ts`, update `message` parameter description to "Additional context or detailed question body (all methods)"
- [x] 1.2 In `ask-user-tool.ts`, pass `message` through `opts` for `input` case: `ctx.ui.input(params.title, params.placeholder, { message: params.message })`
- [x] 1.3 In `ask-user-tool.ts`, pass `message` through `opts` for `select` case: `ctx.ui.select(params.title, params.options ?? [], { message: params.message })`
- [x] 1.4 In `ask-user-tool.ts`, pass `message` through `opts` for `multiselect` case: pass `{ message: params.message }` as opts

## 2. Update ui-proxy to forward message

- [x] 2.1 In `ui-proxy.ts` `input` wrapper, extract `opts?.message` and include in params dict
- [x] 2.2 In `ui-proxy.ts` `select` wrapper, extract `opts?.message` and include in params dict
- [x] 2.3 In `ui-proxy.ts` `multiselect` wrapper, accept opts parameter and extract `message` into params dict
- [x] 2.4 In `ui-proxy.ts`, for TUI fallback calls, concatenate `title + "\n\n" + message` when message is present

## 3. Update client renderers

- [x] 3.1 In `InputRenderer.tsx`, add `message` display below title (pending state only) using `<MarkdownContent>`
- [x] 3.2 In `SelectRenderer.tsx`, add `message` display below title (pending state only) using `<MarkdownContent>`
- [x] 3.3 In `MultiselectRenderer.tsx`, add `message` display below title (pending state only) using `<MarkdownContent>`

## 4. Tests

- [x] 4.1 Add/update tests in `ask-user-tool.test.ts` verifying message is passed through opts for input/select/multiselect
- [x] 4.2 Add/update tests in `ui-proxy.test.ts` verifying message appears in extension_ui_request params
- [x] 4.3 Run targeted test suite (47/47 pass) — full suite skipped (hangs session)
