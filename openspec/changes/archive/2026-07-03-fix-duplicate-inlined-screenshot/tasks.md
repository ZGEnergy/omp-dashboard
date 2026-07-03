# Tasks — fix duplicate inlined screenshot

## 1. Byte-dedup guard (inliner)
- [x] Collect base64 payloads of image blocks already in the original result → verify: unit fixture with a native image block
- [x] Skip appending a path whose inlined bytes match an existing block; strip its path from text → verify: MCP-shape test yields 1 image, path stripped, `inlinedCount === 0`
- [x] Keep genuinely-different images → verify: native image + path to a different file yields 2 images (`inlinedCount === 1`)
- [x] Return the rewritten result when only a path was stripped (guard `blocks.length === 0 && consumedPaths.length === 0`) → verify: strip-only case returns a new content object

## 2. Bridge propagation
- [x] Apply the inliner result on result-identity change, not `inlinedCount > 0` → verify: strip-only rewrite reaches the forwarded event; unchanged results stay no-op (same reference)

## 3. Regression + suite
- [x] Add 2 regression tests (MCP-shape dedup; mixed-different-image preserved) → verify: `HOME=$(mktemp -d) npx vitest run packages/extension/src/__tests__/tool-result-image-inliner.test.ts` green (12/12)
- [x] Full extension suite green → verify: `npx vitest run packages/extension` (1122/1122)
- [x] Real-data verification: ran the shipped `inlineToolResultImages` against the REAL persisted MCP `browser` result (native image + file path + real `readFile`) → `inlinedCount 0`, output image blocks **1** (was 2), path stripped. Native image base64 confirmed byte-identical to the on-disk file (55844 chars) so the byte-dedup gate fires. NOTE: reloading THIS session mid-turn does NOT hot-swap its bridge for events in the same turn, so in-turn post-reload screenshots still rendered 2 (old bridge) — a reload-timing artifact, not a fix failure. Fresh turns / other reloaded sessions get the fixed bridge.

## 4. Documentation
- [x] Update `packages/extension/src/AGENTS.md` `tool-result-image-inliner.ts` row — byte-dedup against native image blocks (direct edit — source tree)
- [x] Update the `bridge.ts` row — apply-on-result-identity-change note (direct edit — source tree)
