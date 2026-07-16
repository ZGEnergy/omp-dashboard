# Tasks

## Server — carry out-of-cwd entries without reading the file

- [ ] `session-diff.ts`: stop dropping out-of-cwd Write/Edit paths; carry the entry keyed by
      absolute path with its `changes[]` payload → verify: unit test an out-of-cwd Write
      appears in `data.files`; an unauthored out-of-cwd path never appears.
- [ ] `session-diff.ts`: in `buildSessionDiff`, split entries into in-cwd (enriched) vs
      out-of-cwd (payload-only) and pass ONLY in-cwd entries to `enrichWithGitDiff` — the guard
      lives BEFORE enrichment so the `readFileSync(resolve(cwd, absPath))` untracked branch can
      never receive an out-of-cwd path → verify: test with cwd `/repo/packages/server` + write
      `/repo/.env` asserts NO `readFileSync`/`git` invocation for that path and no `gitDiff` on
      the entry (cycle-2 F1).
- [ ] Confirm in-cwd relative-key + enrichment unchanged → verify: existing session-diff
      tests pass (regression).
- [ ] `security-hardening` pass: assert the builder performs zero disk reads of out-of-cwd
      paths.

## Server — session-addressed full-payload endpoint (no path input)

- [ ] Add a localhost-only endpoint returning `{ content?, edits? }` for `(sessionId,
      toolCallId)`: resolve the JSONL via `sessionManager.get(sessionId).sessionFile` (NEVER
      construct a path from `sessionId`), `loadSessionEntries`, then scan assistant-message
      `content[]` for `{ type: "toolCall", id === toolCallId }` (nested id, not top-level) and
      return `args.content`/`args.edits` → verify: test returns untruncated content for a > 4 KB
      Write and for a > 20-op Edit; returns not-found when the id is absent (cycle-2 F2).
- [ ] Confirm the endpoint accepts only session identifiers — no `path` param, no
      `fs.realpath`, no path fallback on a miss → verify: test/inspection asserts no
      filesystem-path code path exists; a bogus `toolCallId` returns not-found, reads nothing
      (cycle-2 F3).
- [ ] `doubt-driven-review` on the endpoint's input surface BEFORE it stands (session-id-only,
      not path).

## Client — opt-in preference + payload render + lazy upgrade

- [ ] Add `showOutOfCwdSessionDiffs` preference (default off) + settings toggle → verify:
      persists; default off.
- [ ] `ChatView`/`buildTurnSummaries` consumer: suppress out-of-cwd rows when off → verify:
      off hides row, on shows it.
- [ ] `DiffViewer`/`DiffPanel`: resolve out-of-cwd entry by absolute key; render via existing
      Path C (`changeToRichDiff`) → verify: diff renders from payload, not the empty state.
- [ ] Absolute-key fallout: render out-of-cwd entries in a distinct "outside workspace"
      grouping (not the relative `diff-tree` — an absolute path splits to a blank-root node);
      set `previewable: false` on out-of-cwd entries and make `DiffPanel` hide the File-view
      toggle when `previewable === false` → verify: mixed abs+relative list produces no
      blank-root tree node; the File toggle is absent for an out-of-cwd tab (cycle-2 F4/F5).
- [ ] Lazy full-fidelity fetch when payload truncated / `edits` collapsed; degrade
      gracefully on failure → verify: truncated `content` triggers a fetch and renders full;
      collapsed edits with no fetch shows "diff too large to show inline"; deleted-since-write
      shows "file no longer present".

## Tests (folded from test-plan.md — automated scenarios)

### L1 unit (vitest) — see `packages/server/src/__tests__/session-diff.test.ts`, `session-routes-tool-result.test.ts`, `session-file-reader.test.ts`

- [ ] (test-plan #E1) out-of-cwd carried, payload-only. Input: events with Write to `/tmp/mockup/index.html`, cwd `/repo` · Trigger: `buildSessionDiff(events, cwd)` · Observable: `data.files` has entry keyed `/tmp/mockup/index.html` with `changes[]`, `gitDiff` undefined. Exemplar: `session-diff.test.ts`.
- [ ] (test-plan #E2) in-cwd unchanged regression. Input: Write to `src/a.ts` in git cwd · Trigger: `buildSessionDiff` · Observable: entry keyed relative `src/a.ts`, existing git/synthetic enrichment retained. Exemplar: `session-diff.test.ts`.
- [ ] (test-plan #E3) SECURITY guard-before-enrichment. Input: cwd `/repo/packages/server`, Write to `/repo/.env` (out-of-cwd, under repo, untracked), spy `fs.readFileSync`+git runner · Trigger: `buildSessionDiff` · Observable: zero `readFileSync(resolve(cwd,path))` + zero git calls for `/repo/.env`, entry has no `gitDiff`. Exemplar: `session-diff.test.ts`.
- [ ] (test-plan #E4) on-demand full content. Input: JSONL with a 7 KB Write (in-memory truncated at 4 KB) · Trigger: GET full-payload endpoint `(sessionId, toolCallId)` · Observable: returns untruncated 7 KB `content`, no `…[truncated]`. Exemplar: `session-routes-tool-result.test.ts` + `session-file-reader.test.ts`.
- [ ] (test-plan #E5) on-demand full edits >20 ops. Input: Edit with 21 ops (in-memory `edits` collapsed) · Trigger: GET endpoint · Observable: returns full 21-element `edits`. Exemplar: `session-routes-tool-result.test.ts`.
- [ ] (test-plan #E6) endpoint miss reads nothing. Input: valid sessionId, unknown `toolCallId`, spy fs · Trigger: GET endpoint · Observable: not-found, no file read, no path built from sessionId. Exemplar: `session-routes-tool-result.test.ts`.
- [ ] (test-plan #E7) SECURITY no path input / no traversal. Input: sessionId with `../` or path-looking `toolCallId` · Trigger: GET endpoint · Observable: resolves only via `sessionManager.get(sessionId).sessionFile`, reads nothing outside that transcript. Exemplar: `session-routes-tool-result.test.ts`.
- [ ] (test-plan #E8) preference default off. Input: fresh preferences store · Trigger: read `showOutOfCwdSessionDiffs` · Observable: `false`. Exemplar: nearest preferences-store test (extend it).
- [ ] (test-plan #X3) JSONL file missing on disk. Input: `sessionFile` recorded but file deleted · Trigger: GET endpoint · Observable: graceful not-found, no throw, reads nothing else. Exemplar: `session-file-reader.test.ts`.

### L3 e2e (Playwright, docker harness — port from `.pi-test-harness.json`) — see `tests/e2e/change-summary-table.spec.ts`, `tests/e2e/editor-pane.spec.ts`

- [ ] (test-plan #F1) pref off suppresses row. Input: session wrote `/tmp/mockup/index.html`, pref off · Trigger: render change-summary block · Observable: file NOT listed, no `diff:` tab openable. Exemplar: `change-summary-table.spec.ts`.
- [ ] (test-plan #F2) pref on renders payload diff. Input: same, pref on · Trigger: click out-of-cwd row · Observable: `diff:` tab opens, renders from `change.content`, not the empty state. Exemplar: `change-summary-table.spec.ts` + `editor-pane.spec.ts`.
- [ ] (test-plan #F3) large payload upgrades, no cap. Input: out-of-cwd Write of 1 MB file (in-memory truncated), pref on · Trigger: open diff tab · Observable: lazy-fetches full payload, converges to complete 1 MB content, no size cap. Exemplar: `editor-pane.spec.ts`.
- [ ] (test-plan #F4) absolute key does not corrupt tree. Input: `data.files` mixing `/tmp/mockup/index.html` + `src/a.ts` · Trigger: render changed-files tree · Observable: no blank-root node, out-of-cwd entry in its own "outside workspace" grouping. Exemplar: `editor-pane.spec.ts`.
- [ ] (test-plan #F5) file-content toggle hidden out-of-cwd. Input: out-of-cwd diff tab `previewable:false` · Trigger: render viewer toolbar · Observable: no "File" content-view toggle. Exemplar: `editor-pane.spec.ts`.
- [ ] (test-plan #X1) deleted-since-write. Input: out-of-cwd file written then deleted, pref on · Trigger: open diff tab · Observable: "file no longer present", no path read. Exemplar: `change-summary-table.spec.ts`.
- [ ] (test-plan #X2) lazy fetch fails + truncated. Input: in-memory truncated, endpoint errors · Trigger: open diff tab · Observable: partial diff + "content truncated — full version unavailable" banner, never blank, no fs read. Exemplar: `change-summary-table.spec.ts`.

## Validate

- [ ] `openspec validate opt-in-out-of-cwd-session-diffs --strict` passes.
- [ ] Manual: mockup-loop writes `/tmp/…`; toggle off → no row; toggle on → row renders a
      diff; a > 4 KB mockup renders fully after the lazy fetch; server logs show no read of
      the `/tmp/…` path.
