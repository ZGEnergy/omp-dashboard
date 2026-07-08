> **Precondition:** the connected pi-flows session emits `result.cost` on
> `flow:agent-complete` (change `surface-agent-node-cost`). The bridge already
> forwards event `data` verbatim, so no transport work is needed — this change is
> entirely client-side (shared types + flows-plugin reducer + render).

## 1. Failing tests (write first, verify red)

- [ ] 1.1 Add a reducer test (beside `node-kind-reducer.test.ts` /
  `reducer-parity.test.ts`) asserting that a `flow_agent_complete` event whose
  `result.cost` is `0.0142` stores `cost === 0.0142` on the matched
  `FlowAgentState` (spec `flow-agent-card` — cost originates from state).
- [ ] 1.2 Add a reducer test asserting a `flow_agent_complete` with no `cost`
  leaves `FlowAgentState.cost === undefined` (does not throw, does not default).
- [ ] 1.3 Add a unit test for the `formatCost` helper: `>= 1 → 2dp` (`1.2 → "$1.20"`),
  `< 1 → 4dp` (`0.0142 → "$0.0142"`) (spec `flow-agent-card` decimal scenarios).
- [ ] 1.4 Add a `FlowAgentCard` render test: a completed card with `cost = 0.0142`
  shows a `$0.0142` segment in the stats line; with `cost = 0` and with
  `cost = undefined` the stats line shows tokens+duration only, no `$`, no
  dangling separator (spec `flow-agent-card` suppression scenarios).
- [ ] 1.5 Add a `FlowAgentDetail` header test: cost shows when present and `> 0`,
  omitted when `0`/absent (spec `flow-agent-detail`).
- [ ] 1.6 Run the flows-plugin test suite and confirm the new tests FAIL for the
  right reason (missing field / helper / render), not harness errors.

## 2. Type surface (shared)

- [ ] 2.1 Add `cost?: number` to `FlowAgentState` in `packages/shared/src/types.ts`,
  documented as accumulated per-agent USD cost from `flow_agent_complete`, a
  sibling of `tokens`.
- [ ] 2.2 Run the shared package typecheck; confirm no new errors.

## 3. Reducer

- [ ] 3.1 In `packages/flows-plugin/src/flow-reducer.ts` `flow_agent_complete`
  case, add `cost?: number` to the inline `result` type.
- [ ] 3.2 In the same case's `agents.set(...)`, add `cost: result?.cost` beside
  `tokens: result?.tokens` (verbatim pass-through, D2).

## 4. Card render

- [ ] 4.1 Add a `formatCost(n: number): string` helper to
  `packages/flows-plugin/src/client/FlowAgentCard.tsx` matching pi-flows:
  `"$" + (n >= 1 ? n.toFixed(2) : n.toFixed(4))`. Export it for reuse (D4).
- [ ] 4.2 In the complete-state stats line (currently
  `↑{in} ↓{out} · {duration}`), insert ` · ${formatCost(agent.cost)}` between
  tokens and duration only when `agent.cost != null && agent.cost > 0` (D3).

## 5. Detail render

- [ ] 5.1 In `packages/flows-plugin/src/client/FlowAgentDetail.tsx`, show cost in
  the header alongside tokens/duration, importing `formatCost` from the card
  module, guarded by the same `!= null && > 0` condition.

## 6. Verify green

- [ ] 6.1 Run the flows-plugin + shared test suites; confirm all section-1 tests
  now pass.
- [ ] 6.2 Run `npm run build` (client) and typecheck; confirm clean.

## 7. Docs

- [ ] 7.1 Update the `cost` note in the per-file rows for `FlowAgentState`
  (`packages/shared/src/AGENTS.md`) and the card/detail
  (`packages/flows-plugin/src/client/AGENTS.md`), caveman style.
- [ ] 7.2 Add a `CHANGELOG.md` entry under `[Unreleased]` (edited directly).
