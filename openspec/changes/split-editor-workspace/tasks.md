# Tasks — Split Editor Workspace

## 1. Split layout scaffold (client)
- [ ] 1.1 Add `split-state.ts` — per-session `localStorage` (`pi-dashboard:split:<id>`), shape `{ open, ratio, orientation }`, best-effort read/write. → verify: unit test round-trips + corrupt-JSON returns default.
- [ ] 1.2 Add `useSplitRatio.ts` + `SplitDivider.tsx` — extract drag logic from `ResizableSidebar`, store ratio (0..1), clamp `[0.25,0.75]`, orientation-aware cursor. Reuse for BOTH the outer chat/editor divider and the inner browse-rail divider. → verify: unit test clamp + ratio math.
- [ ] 1.3 Add `SplitWorkspace.tsx` — renders `ChatView` alone when closed; `ChatView` + `SplitDivider` + `EditorPane` when open; horizontal on desktop, vertical stack when `useMobile()`. → verify: RTL test both orientations.
- [ ] 1.4 Wire `SplitWorkspace` into `App.tsx` content router in place of the `/session/:id` vs `/session/:id/editor` route swap; retain the route as a deep-link. → verify: existing ChatView tests still pass; editor route opens split.
- [ ] 1.5 Add the inner browse-rail divider inside `EditorPane` (rail↔viewer): reuse `SplitDivider`, clamp rail width, persist per session alongside pane state, independent of the outer split ratio. → verify: RTL test rail resize + persist + outer ratio unchanged.

## 2. Split toggle + auto-split (client)
- [ ] 2.1 Add split/unsplit toggle to the session header; reflect + persist `open`. → verify: toggle test flips state + persists.
- [ ] 2.2 Add `openInSplit(sessionId, relPath, line?)` helper: ensure split open → `openFile` → focus tab → scroll to line. → verify: unit test opens split when closed.
- [ ] 2.3 Route `OpenFileButton`, `FileLink`/`useFileOpenRouting`, tree click, and search-result select through `openInSplit`. → verify: file-link click test auto-splits.
- [ ] 2.4 Deep-link route mount calls `openInSplit` instead of full route swap. → verify: `/session/:id/editor?file=…&line=…` opens split + scrolls.

## 3. `@`-mention completeness + min-3-char (bridge)
- [ ] 3.1 `searchFiles`: add `.gitignore` parsing/pruning alongside `IGNORE_DIRS` (best-effort). → verify: unit test ignored dir not descended; missing `.gitignore` no error.
- [ ] 3.2 `searchFiles`: soften `MAX_VISITS` + depth guard so late top-level subtrees are reached. → verify: unit test match in late subtree surfaced.
- [ ] 3.3 `searchFiles`: optional regexp leaf mode with graceful fallback on invalid pattern. → verify: unit test regexp match + invalid-pattern fallback.
- [ ] 3.4 Composer/bridge: require min-3-char leaf before walk-backed `list_files`; bare `@` still lists top-level. → verify: unit test 2-char no request, 3-char requests, bare `@` requests.
- [ ] 3.5 Update `file-autocomplete` spec deltas (already drafted) reflect the above. Bridge change → `npm run reload`.

## 4. Content search endpoint (server)
- [ ] 4.1 Add `ripgrep` detection helper (once per server, like editor detection). → verify: unit test present/absent.
- [ ] 4.2 Add `GET /api/grep` → prefer `rg`, bounded JS fallback; return `{ path, line, col, snippet }[]`; caps on files/bytes/matches. → verify: handler test both paths.
- [ ] 4.3 Apply `/api/file` security gates: cwd known-session check + path containment. → verify: traversal rejected, unknown-cwd rejected.

## 5. Editor search panel (client)
- [ ] 5.1 Add `EditorSearchPanel.tsx` — mode toggle (Filenames/Contents), regexp toggle, min-3-char + debounce, "type ≥ N chars" hint. → verify: RTL test modes + min-length hint.
- [ ] 5.2 Filenames mode → bridge walk; Contents mode → `/api/grep`. Render ranked results with path + (content) line/snippet + highlight. → verify: RTL test both result shapes.
- [ ] 5.3 Keyboard nav (`↑↓`, `↵` open via `openInSplit`, `Esc` close); content match scrolls to line. → verify: RTL test nav + open + line scroll.
- [ ] 5.4 Add search toggle button to pane header (Cmd-P / Cmd-Shift-F). → verify: shortcut opens panel.

## 6. Changed-on-disk banner (server + client)
- [ ] 6.1 Server: watch a session's open files; emit `file_changed(path)`; create/tear down per open tab, on session switch, on disconnect (no fd leak). → verify: watch fires on write; torn down on close.
- [ ] 6.2 Add the `file_changed` event to the protocol + server→client push. → verify: protocol test + integration push.
- [ ] 6.3 Client pane: per-tab changed-on-disk banner with Refresh (existing manual-refresh path); no auto-reload; dismiss keeps stale view. → verify: RTL test banner shows, Refresh re-fetches, no auto-reload, non-open file no banner.

## 7. Responsive + persistence QA
- [ ] 7.1 Desktop horizontal + mobile stacked verified against the mockup (`mockups/index.html`) in dark + light. → verify: isolated-ui-verification browser pass at 3 breakpoints.
- [ ] 7.2 Per-session split state isolation (A open 50/50, B closed) + reload restore. → verify: RTL/integration test.

## 8. Docs + gates
- [ ] 8.1 Add file-index rows for new client/server files (delegate `docs/` writes per Documentation Update Protocol, caveman style). → verify: rows present, alphabetical.
- [ ] 8.2 Update `docs/architecture.md` split-editor data-flow note (delegate). → verify: note present.
- [ ] 8.3 `openspec validate split-editor-workspace` passes; `npm run quality:changed`; `npm test`. → verify: all green.
- [ ] 8.4 Full rebuild + reload after apply (`npm run build`, `POST /api/restart`, `npm run reload`). → verify: `/api/health` mode intact; split renders live.
