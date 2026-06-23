## Context

`result.md` capture lives entirely in the automation-plugin server entry (`packages/automation-plugin/src/server/index.ts`). The flow:

1. On `session_register` the host stamps the spawned session with `automationRun`. The plugin's `onEvent` correlates by `automationRun.runId` (commit 5009b883) and calls `ctx.sendToSession(sessionId, promptText)` to deliver the action prompt, then `runText.set(sessionId, [])`.
2. For every subsequent forwarded event on a tracked session, `extractAssistantText(event)` is pushed into `runText[sessionId]`.
3. On `agent_end`, `runText[sessionId]` is joined and handed to `engine.onSessionEnded(sessionId, result)` which writes `result.md` (empty → auto-archive).

The defect is step 2's extractor. It accepts any event whose `data.text | data.content | data.message.content` is non-empty and whose role is not explicitly a non-assistant role. The injected prompt — delivered by step 1 — round-trips through the session as an input/echo event with no explicit assistant role, so it is captured; the assistant's real reply is shaped differently and slips through.

## Goals / Non-Goals

- Goal: `result.md` contains the run's assistant output only.
- Goal: the injected action prompt never appears in `result.md`.
- Goal: empty/again-no-findings runs still flush empty → auto-archive.
- Non-Goal: changing the on-disk format, location, retention, correlation, or the ChatView live transcript (the transcript already renders correctly; only the captured summary is wrong).
- Non-Goal: capturing tool calls or reasoning — `result.md` is the assistant's textual findings.

## Decisions

### Decision 1: Anchor capture to the verified assistant-output event shape

Before coding, enumerate the real event shapes pi forwards for the run session (instrument `ctx.onEvent` once against a live run, or read pi's event contract). Capture text only from the event(s) that carry assistant message output. Treat a role-less text event as NON-assistant (invert the current lenient guard): require `role === "assistant"` explicitly, or match the specific assistant message `eventType`.

Rationale: the empirical failure (prompt captured, `PONG` never captured) proves the current heuristic both over-captures the prompt and under-captures the reply. Pinning to the actual assistant event shape fixes both.

### Decision 2: Exclude the injected prompt by identity, defensively

Even with a tightened role guard, belt-and-suspenders: the plugin knows the exact `promptText` it injected per run. The capture path MAY skip any captured chunk equal to the run's injected `promptText`. This guarantees the prompt cannot leak even if pi's input-echo event ever carries an `assistant`-ish shape.

Rationale: cheap, run-scoped, and immune to future event-shape drift.

### Decision 3: Keep the buffer + agent_end flush model

No change to buffering/flush/auto-archive. Only the per-event predicate (what counts as capturable assistant text) changes. This keeps the diff surgical and preserves the existing concurrency/runId-keyed semantics.

## Risks / Trade-offs

- Risk: pi's assistant-output event shape differs across versions. Mitigation: verify against the live event stream before pinning; keep extraction tolerant to the known assistant shapes (`data.text`, `data.message.content`) but gated on an explicit assistant role / eventType.
- Risk: a model that legitimately repeats the prompt verbatim would be filtered by Decision 2. Accepted — vanishingly rare and harmless for a findings summary.

## Verification

- Unit test: feed `[injected-prompt echo event, assistant reply event, agent_end]` → `result.md` == reply, excludes prompt.
- Unit test: feed `[injected-prompt echo event, agent_end]` (no assistant reply) → empty → run auto-archived.
- Live: re-run the PONG automation; `result.md` == `PONG`.
