# Design — Split Editor Workspace

## Context

The internal editor pane already ships (tabs, lazy file-tree rail, viewer registry,
lazy Monaco, per-session `localStorage`, read-only v1). It is mounted as a **route
swap**: the content router in `App.tsx` renders `ChatView` for `/session/:id` and
`EditorPane` for `/session/:id/editor` — mutually exclusive. This change turns that
either/or into a **co-mounted split**, adds file/content search, fixes the
`@`-mention completeness gap, and adds a changed-on-disk signal.

```
   TODAY (route swap)                    THIS CHANGE (co-mounted split)
   ┌──────────────┐                      ┌────────┬─┬─────────┐
   │  ChatView    │  ── OR ──▶           │ Chat   │║│ Editor  │
   │  (route A)   │   EditorPane         │ View   │║│ Pane    │
   └──────────────┘   (route B)          └────────┴─┴─────────┘
                                          persisted ratio ↑ resizable divider
```

## Decision 1 — Split layout: co-mount, keep the route as a deep-link

`SplitWorkspace` wraps the content area. When split is **open** it renders
`ChatView` + `SplitDivider` + `EditorPane` together; when **closed** it renders
`ChatView` alone (today's behaviour). The `/session/:id/editor` route is retained but
re-interpreted: navigating to it **opens the split** and focuses the editor, rather
than replacing chat. This preserves deep-links, copied URLs, and back/forward.

- **Why not a new route for the split?** The split is a *view state* of a session,
  not a distinct page. Encoding it as `localStorage` state (like `editor-pane-state`)
  keeps the URL stable and matches the existing pane-state persistence idiom.

## Decision 2 — Resizable dividers (TWO): extract from `ResizableSidebar`

`ResizableSidebar` already implements drag-to-resize with a min/max clamp and
persisted width. Extract the reusable part into `useSplitRatio(sessionId)` +
`SplitDivider`, and reuse it for **two independent dividers**:

1. **Outer** — chat ↔ editor. Stores a **ratio** (0..1), clamps `[0.25, 0.75]`,
   orientation-aware (`col-resize` desktop / `row-resize` stacked), persists under
   `pi-dashboard:split:<sessionId>`.
2. **Inner** — browse rail ↔ viewer, *inside* the editor pane. Stores the rail width,
   clamps to a usable min for both sides, persists alongside the pane state. Resizing
   the rail SHALL NOT change the outer ratio, and vice-versa.

```
   ┌────────┬─┬─────────────────────────────┐
   │ Chat   │║│  Editor pane                 │
   │ View   │║│  ┌────────┬─┬─────────────┐  │
   │        │║│  │ browse │┋│  viewer     │  │
   └────────┴─┴──┴────────┴─┴─────────────┘  │
    outer ratio ↑   inner rail width ↑ (independent)
```

The rail also stays **collapsible** (existing pane behaviour); collapse hides it
entirely, and re-expand restores the persisted width. Ratio (0..1) is used for the
outer split so it survives window resizes; the inner rail uses a clamped pixel width
(a tree rail reads better at a stable width than a proportional one).

```
   split-state.ts  →  { open: boolean, ratio: number, orientation: 'h'|'v' }
   key: pi-dashboard:split:<sessionId>     (mirrors editor-pane-state idiom)
```

## Decision 3 — Responsive: side-by-side desktop, stacked mobile

`useMobile()` already exists. Desktop → horizontal split (chat left / editor right).
Below the breakpoint → vertical stack (chat top / editor bottom) with a row-resize
divider. The split remains usable on mobile (chosen over "chat-only on mobile"). The
sidebar hides on mobile as it does today; the split lives in the full content column.

## Decision 4 — Search substrate (the load-bearing decision)

`fix-file-mention-search-ranking` explicitly recorded: *"NOT INTRODUCED: Server-side
caching or an index. `searchFiles` still walks the tree per request."* Introducing a
persistent index here would **reverse a deliberate architecture choice**. We do not.
Instead:

| Need | Mechanism | Cached? | Reverses prior decision? |
|------|-----------|---------|--------------------------|
| Filename search / `@` completeness | per-request BFS walk, **tuned** | no | **no** — same walk, better bounds |
| Content search (grep) | new `GET /api/grep` → `ripgrep`, JS fallback | no (fresh scan) | no — new capability |
| Changed-on-disk signal | narrow `fs.watch` on **open files only** | n/a | no — not a tree index |

**Walk tuning (completeness fix without an index):**
```
   BEFORE                          AFTER
   MAX_VISITS = 4000 (hard)   →    softened budget, .gitignore-aware pruning
   depth ≤ 6 (hard)           →    relaxed depth guard
   IGNORE_DIRS (hardcoded)    →    IGNORE_DIRS + parsed .gitignore
   substring only             →    substring OR regexp leaf
   fires on 1 char            →    min 3-char leaf (bare @ = top-level list)
```
`.gitignore` awareness is the highest-leverage fix: it stops the budget being spent
on `coverage/`, `target/`, `.turbo/`, build output — freeing it for real source. The
softened `MAX_VISITS`/depth then covers the long tail.

**Escalation path (deferred, out of scope):** if `ripgrep`-less environments make
content grep too slow, or filename walks still miss on giant monorepos, a persistent
watched index (`chokidar`-style, invalidated on fs events, shared by `@` + editor
search) is the next step — and *only then* would the prior "no index" decision be
revisited, with its own proposal and justification.

## Decision 5 — Content grep endpoint

`GET /api/grep?cwd=<cwd>&q=<query>&regex=<bool>&mode=content` returns ranked matches
`{ path, line, col, snippet }[]`. Implementation:

- Detect `ripgrep` (`rg`) once per server (like editor detection); prefer it (respects
  `.gitignore`, fast, regexp native).
- Fallback: bounded JS scan (skip `IGNORE_DIRS` + `.gitignore`, cap files + bytes +
  matches) so the feature works without `rg` installed.
- **Security:** same gates as `/api/file` — `cwd` must match a known session path;
  resolved paths must stay within `cwd`; reject traversal. Cap total matches to avoid
  runaway responses.

## Decision 6 — Changed-on-disk signal, not auto-reload

The pane is read-only and deliberately does **not** auto-refresh on agent edits (v1
decision: avoid clobbering scroll position). This change adds the *signal* only:

```
   server: watch(open files for session)  ──file_changed(path)──▶  client pane
                                                                      │
                                              ┌───────────────────────┘
                                              ▼
                          ⚠ "<file> changed on disk. Cached view is stale."  [Refresh]
```

- Watch scope = the pane's **open files** for that session (a handful), created/torn
  down as tabs open/close. No whole-tree watcher.
- The banner is per-tab; **Refresh** re-fetches `/api/file` (existing manual-refresh
  path). Dismiss leaves the stale view.
- Ties into the user's "cache about files which can be changed": the *cache* is the
  pane's in-memory file buffer; the *notification* is this banner.

## Decision 7 — Open-file persistence stays localStorage (server-side deferred)

"Save the opened file to session" is satisfied today by `editor-pane-state.ts`
(per-session `localStorage` key). We reuse it. **Open question flagged:** if the user
wants open-file state to survive across *devices/browsers* (not just reloads), that
requires server-side session state — a larger change, deferred. v1 = localStorage,
matching the shipped pane.

## Decision 8 — Auto-split on open

Every "open a file" entry point routes through one helper `openInSplit(sessionId,
relPath, line?)`:
```
   openInSplit():  if !split.open → split.open = true (persist)
                   → editorPane.openFile(relPath, viewer)  → focus tab, scroll to line
```
Callers updated: `OpenFileButton`, `FileLink`/`useFileOpenRouting`, tree click,
search-result click. The old full-route-swap navigation is replaced by this; the
route remains as a deep-link that calls the same helper on mount.

## Risks / trade-offs

- **`ripgrep` absence** → JS fallback slower; mitigated by caps + the min-3-char
  debounce. Acceptable for v1; index is the escalation.
- **Softened walk budget** → larger walks per keystroke; mitigated by `.gitignore`
  pruning (net *fewer* visits on typical repos) + min-3-char + debounce.
- **Split on mobile** → cramped; mitigated by the stacked layout + clamped ratio.
  Users can unsplit for full-height chat.
- **Open-files watcher lifecycle** → must tear down on tab close / session switch /
  disconnect to avoid fd leaks; covered in tasks.
