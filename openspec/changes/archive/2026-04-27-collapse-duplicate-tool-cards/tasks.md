## Tasks

- [x] Add `packages/client/src/lib/collapse-retried-errors.ts` with `findRetriedErrorIds` and `findActiveInteractiveToolResultIds`. Both pure, side-effect-free, share a `SKIP_ROLES` constant for look-ahead.
- [x] Add `packages/client/src/lib/__tests__/collapse-retried-errors.test.ts` covering: retry / no-retry / different-tool / chained-errors / user-boundary / running-retry / multi-pair / missing-toolName (8 cases) + hide-on-pending / skip-thinking / no-hide-on-resolved / no-hide-on-complete-toolResult / no-hide-on-error / no-hide-different-tool-between / no-hide-standalone (7 cases) — 15 total, all green.
- [x] Add `packages/client/src/components/RetriedErrorBadge.tsx` with collapsed pill (icon + `<toolName> failed — retried ›`) and expanded view that reuses `<ToolCallStep status="error">` plus a "Hide failed attempt" toggle.
- [x] Wire `ChatView.tsx`: import both helpers, compute `retriedErrorIds` and `hiddenToolResultIds` via `useMemo` keyed on `filteredMessages`, return `null` for hidden ids, render `<RetriedErrorBadge>` for retried-error ids before the default `<ToolCallStep>` branch.
- [x] Add regression test in `packages/extension/src/__tests__/ask-user-tool.test.ts`: `prepareArguments({})` returns `{}` with no synthesized `method` / `title` / `questions`, preserving schema rejection.
- [x] `npm run build` — verify production bundle includes the new helpers (latest `index-*.js` chunk).
- [x] Restart dashboard server, hard-refresh browser, verify on a live `ask_user` call that:
  - Empty `{}` invocation: schema rejection card collapses to a one-line pill below the next valid retry; clicking expands the original error.
  - Valid invocation: only the `Allow/Deny/Cancel` dialog renders during pending; after answering, the full tool-call card appears in history with the `User responded:` result.
- [x] Update `AGENTS.md` key-files table with `collapse-retried-errors.ts` and `RetriedErrorBadge.tsx`.
- [x] Update `openspec/specs/chat-view/spec.md` (after archive) and `openspec/specs/ask-user-tool/spec.md` (after archive) with the new requirements via `openspec archive`.
