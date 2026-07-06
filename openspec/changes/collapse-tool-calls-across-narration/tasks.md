# Tasks

## 1. Semantic pass carries absorbed narration
- [ ] 1.1 `group-tool-calls.ts`: add `rendered: ChatMessage[]` to `ToolCallGroup` — the full interleaved slice (toolResults + absorbed transparent rows) in original order. Keep `messages` (toolResult-only) for count/summary.
- [ ] 1.2 Populate `rendered` in `groupConsecutiveToolCalls` from the walked window `[i, lastToolEnd)`; leave the sub-threshold verbatim-emit path unchanged.
- [ ] 1.3 Update/extend `group-tool-calls` unit tests: `rendered` includes absorbed thinking/prose; `messages` unchanged; sub-threshold path byte-identical.

## 2. Flip burst composition to semantic-first
- [ ] 2.1 `group-tool-bursts.ts`: run `groupConsecutiveToolCalls(messages)` over the FULL stream first; walk the resulting `ChatItem[]`.
- [ ] 2.2 Form bursts over runs of tool-like items (`toolResult` row OR `×N` group = one member); non-empty `assistant` prose stays a HARD boundary; `thinking`/separators/`rawEvent`/`commandFeedback`/empty-`assistant` transparent.
- [ ] 2.3 Keep threshold ≥ 3 members; sub-threshold emits items verbatim; burst `id` = first tool-like member id (group → its `messages[0].id`).
- [ ] 2.4 Remove the obsolete raw-array `burstEnd`/`isTransparent(message)` walk superseded by the semantic-first walk.

## 3. Render narration in expanded views
- [ ] 3.1 `CollapsedToolGroup.tsx`: expanded view iterates `group.rendered` — `toolResult` → `ToolCallStep`; `thinking`/non-empty `assistant` → lightweight inline text; empty/separator rows skipped. Count badge/summary unchanged.
- [ ] 3.2 `ToolBurstGroup.tsx`: consume the semantic-first shape; render absorbed narration rows inside the scrollbox interleaved with members; skip empty/separator rows.

## 4. Update burst tests
- [ ] 4.1 Invert `does NOT over-merge identical calls split by prose` → `collapses identical calls split by prose into a ×N`.
- [ ] 4.2 Add: `[curl, curl, prose, curl, curl]` → single `×4` group with prose present in `rendered`.
- [ ] 4.3 Keep/verify heterogeneous prose-splits-burst scenarios pass under semantic-first composition.
- [ ] 4.4 Add: heterogeneous burst with an internal `×N` poll loop nests correctly under the new composition.

## 5. Spec sync
- [ ] 5.1 Confirm the two `chat-view` requirement deltas match the implemented behavior.
- [ ] 5.2 `openspec validate collapse-tool-calls-across-narration --strict` passes.

## 6. Verify + deploy
- [ ] 6.1 `HOME=$(mktemp -d) npx vitest run group-tool-calls group-tool-bursts CollapsedToolGroup ToolBurstGroup` green.
- [ ] 6.2 `npm run quality:changed` (biome + tsc + tests) green.
- [ ] 6.3 Manual browser check: narrated poll loop → one pill; expand shows narration; heterogeneous mid-turn reply still splits.
- [ ] 6.4 `npm run build` + `POST /api/restart` + `npm run reload`.
