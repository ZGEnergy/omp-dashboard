## Context

The pi-flows change `surface-agent-node-cost` (in `~/BB/pi-packages/pi-flows`)
accumulates per-message USD cost in `spawnAgent`, lands it on `AgentResult.cost`,
and emits it on `flow:agent-complete`:

```ts
// pi-flows extensions/flow-engine/flow-tui.ts:634
this.emit("flow:agent-complete", {
  agentName, stepId, nodeKind,
  result: { success, status, summary, files, tokens, cost, duration },
});
```

On the dashboard side, `packages/extension/src/flow-event-wiring.ts` maps
`flow:agent-complete → flow_agent_complete`, and the bridge's EventBus catch-all
forwards the event `data` **verbatim** (comment in `flow-event-wiring.ts`:
"nodeKind / outcome / typed outputs ride INSIDE the event `data` and are
forwarded verbatim"). So `result.cost` already reaches the web client.

It is then dropped at three points, all client-side:

1. `packages/shared/src/types.ts` — `FlowAgentState` (line ~901) has `tokens?`
   and `duration?` but no `cost`.
2. `packages/flows-plugin/src/flow-reducer.ts` — the `flow_agent_complete` case
   (line ~192) types `result` without `cost` and does not copy it into the agent
   entry via `agents.set`.
3. `packages/flows-plugin/src/client/FlowAgentCard.tsx` (line ~176) renders
   `↑{in} ↓{out} · {duration}` with no `$` segment; `FlowAgentDetail.tsx` (line
   ~108) surfaces `tokens` in its header but no cost.

pi-flows formats cost as `$` + (`n >= 1 ? n.toFixed(2) : n.toFixed(4)`)
(`extensions/flow-dashboard/agent-card.ts:13`) and suppresses the segment when
`cost === 0`.

## Goals / Non-Goals

**Goals:**
- Read `result.cost` off `flow_agent_complete` and store it on `FlowAgentState`.
- Render cost next to tokens/duration on the card and in the detail header,
  suppressed when zero/absent.
- Match pi-flows' `formatCost` precision so TUI and web read identically.

**Non-Goals:**
- Any transport / event-contract change (the bridge already forwards `cost`).
- Recomputing cost client-side (the value is pre-summed by pi-flows / pi-ai).
- A flow-wide cost rollup across agents (out of scope; per-agent only, matching
  pi-flows' own scope).
- Live/streaming cost mid-run (cost arrives once, at completion).

## Decisions

**D1 — `cost?: number` is optional on `FlowAgentState`, not required.**
Unlike pi-flows' `AgentResult.cost` (required, with `0` sentinels enforced by
the typechecker at every construction site), the dashboard state is built
incrementally by a reducer from partial event data. A connected pi session that
predates cost surfacing sends no `cost`, so `undefined` is the honest "not
reported" value. Optional-with-undefined mirrors the existing `tokens?` /
`duration?` fields.

**D2 — Reducer stores `result.cost` verbatim.**
In the `flow_agent_complete` case, add `cost` to the inline `result` type and set
`cost: result?.cost` in the `agents.set(...)` call, beside the existing
`tokens: result?.tokens`. No coercion, no default — `undefined` passes through.

**D3 — Render suppresses zero AND undefined; format mirrors pi-flows.**
Add a `formatCost(n)` helper to `FlowAgentCard.tsx` identical to pi-flows'
(`$` + `n >= 1 ? n.toFixed(2) : n.toFixed(4)`). The stats line appends
` · ${formatCost(cost)}` only when `cost != null && cost > 0`, so both `0` and
`undefined` collapse to today's tokens-only line with no dangling separator.
`FlowAgentDetail` applies the same guard in its header.

**D4 — Share the formatter, don't duplicate.**
If `FlowAgentDetail` also renders cost, `formatCost` lives in one module (a small
util or the card file's export) and both import it, per the project DRY rule.

## Risks / Trade-offs

- **[Session predates cost surfacing]** Old pi-flows on the connected session
  omits `result.cost`. → `cost` is `undefined`; the segment is suppressed;
  display is exactly today's. No crash, no `$NaN`.
- **[Format drift between TUI and web]** Two copies of the precision rule could
  diverge. → Mitigated by copying pi-flows' exact expression and asserting it in
  a unit test (`>= 1 → 2dp`, `< 1 → 4dp`); a future shared-helper extraction is
  possible but out of scope here.
- **[Zero vs unpriced ambiguity]** A genuinely free (local-model) run and a
  cost-less legacy event both render identically (no segment). → Acceptable:
  both mean "no spend to show." Matches pi-flows' own zero-suppression rule.

## Migration Plan

Additive and backward-compatible. `FlowAgentState.cost` is a new optional field;
existing persisted/replayed flow state without it deserializes fine (absent →
`undefined`). No schema migration, no data backfill. Rollback = revert the field,
reducer line, and render guards.

## Open Questions

- Whether to extract `formatCost` into a shared client util now vs. inline in the
  card and import from the detail — a code-organization detail resolved during
  implementation (D4), not a spec decision.
