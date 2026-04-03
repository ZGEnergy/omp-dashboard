## Context

The dashboard currently uses three persistence files:

1. **`sessions.json`** — Monolithic array of all non-hidden sessions. Rewritten entirely on every session change (debounced 1s). Contains reconstructable stats (tokens, cost, model) alongside dashboard-only data (name, attachedProposal).
2. **`state.json`** — Mixed bag: `hiddenSessions` (per-session, 220 IDs growing forever), `sessionOrder` (per-cwd), `pinnedDirectories` (global).
3. **`.meta.json`** — Per-session sidecar next to `.jsonl`, currently only stores `{ source: "dashboard" }`.

All three use `json-store.ts` atomic write pattern (write-to-tmp + rename). The server is single-process Node.js, so there's no actual concurrent writer problem — this is about architectural cleanliness and eliminating unbounded state growth.

Pi's session directory structure (`~/.pi/agent/sessions/<encoded-cwd>/<ts>_<uuid>.jsonl`) encodes the cwd in the directory name, session ID and timestamp in the filename. The `.jsonl` header line contains the real cwd (important since directory encoding is lossy — dashes are ambiguous).

## Goals / Non-Goals

**Goals:**
- Consolidate per-session state into a single location (`.meta.json`)
- Eliminate unbounded `hiddenSessions` list — hidden state dies with session file
- Separate global preferences from per-session data
- Reduce write amplification (write 1 session file vs. all sessions)
- Preserve all existing session data through automatic migration
- Maintain startup performance (sub-100ms for ~170 sessions)

**Non-Goals:**
- Changing the `.jsonl` format (pi-owned)
- Changing the client/browser protocol (persistence is server-internal)
- Supporting multi-server concurrent access
- Adding new features — this is a pure refactor of the persistence layer

## Decisions

### Decision 1: `.meta.json` as the single per-session persistence layer

**Choice:** Store all dashboard-owned session data in the existing `.meta.json` sidecar.

**Rationale:** The sidecar pattern already exists, lives next to the `.jsonl` it describes, and is naturally garbage-collected when pi cleans up old sessions. The alternative — a separate dashboard-owned directory structure — would duplicate the session-to-cwd mapping and require its own cleanup logic.

**Schema:**
```typescript
interface SessionMeta {
  // Dashboard-owned (user-set via UI)
  source?: string;          // "dashboard" | undefined
  name?: string;            // User-set session name
  attachedProposal?: string; // User-attached OpenSpec change
  hidden?: boolean;          // User-hidden flag

  // Cached stats (extracted from .jsonl, avoids re-parsing)
  cwd?: string;             // Real cwd (directory encoding is lossy)
  model?: string;
  thinkingLevel?: string;
  status?: string;           // "active" | "idle" | "streaming" | "ended"
  startedAt?: number;
  endedAt?: number;
  tokensIn?: number;
  tokensOut?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: number;
  contextTokens?: number;
  contextWindow?: number;
  firstMessage?: string;
}
```

All fields are optional — a minimal `.meta.json` with just `{ source: "dashboard" }` is valid (backward compatible with existing files). A `cachedAt` timestamp records when stats were last extracted, enabling staleness detection on startup.

### Decision 2: Scan `~/.pi/agent/sessions/*/` at startup instead of reading a manifest

**Choice:** On startup, scan all subdirectories under `~/.pi/agent/sessions/`, list `.meta.json` files, and restore sessions from cached data.

**Rationale:** The filesystem IS the manifest. Benchmarked at ~34ms for 171 sessions (readdir + read 300-byte files). This is comparable to reading a 9KB `sessions.json` and eliminates the need to keep a separate manifest in sync.

**Startup algorithm:**
1. List all subdirectories in `~/.pi/agent/sessions/`
2. For each directory, list `*.meta.json` files
3. For each `.meta.json`:
   - Parse JSON → has cached stats? → check `.jsonl` mtime vs `cachedAt` → if `.jsonl` is newer, re-extract stats and update cache
   - No `.meta.json` for a `.jsonl`? → read `.jsonl` header for id/cwd, extract stats + `firstMessage`, write `.meta.json` for next time
4. Session ID extracted from filename: `<ts>_<uuid>.meta.json` → uuid part
5. `restore()` triggers `onChange(sessionId)` so restored sessions get their `.meta.json` updated if needed

**Fallback:** Sessions without `.meta.json` get discovered when their bridge connects or when the user pins the directory and discovery runs.

### Decision 3: `preferences.json` for global (non-session) state

**Choice:** Create `~/.pi/dashboard/preferences.json` containing only `pinnedDirectories` and `sessionOrder`.

**Rationale:** These are cross-session/global concerns that can't live in per-session files. Keeping them in a dedicated file with a clear name is better than the current `state.json` which mixes per-session hidden flags with global preferences.

**Schema:**
```json
{
  "pinnedDirectories": ["/path/a", "/path/b"],
  "sessionOrder": { "/path/a": ["id1", "id2"] }
}
```

### Decision 4: Per-session debounced writes

**Choice:** Each session gets its own debounce timer. When a session changes, only that session's `.meta.json` is written after a 1s debounce.

**Rationale:** Current approach debounces globally and rewrites all sessions. Per-session debounce means a token update on session A doesn't trigger a write for session B. The `json-store.ts` atomic write pattern (write-to-tmp + rename) is reused.

**Alternative considered:** Single global debounce that writes only dirty sessions. Rejected — adds tracking complexity for the same result.

`SessionManager.onChange` signature changes from `() => void` to `(sessionId: string) => void` so the meta persistence layer knows which session to write.

### Decision 5: Automatic migration on first startup

**Choice:** When the server starts and detects `sessions.json` or `state.json`, run migration automatically before normal startup. Rename old files to `.bak`.

**Rationale:** User should not need to run a separate command. Migration is idempotent — running it twice is safe (`.bak` files won't be re-migrated). A standalone utility function is also available for manual/scripted use.

**Migration steps:**
1. Read `sessions.json` → for each session with a `sessionFile`, write/merge `.meta.json` sidecar
2. Read `state.json` → apply `hiddenSessions` to matching `.meta.json` files (set `hidden: true`)
3. Read `state.json` → write `preferences.json` with `pinnedDirectories` + `sessionOrder`
4. Rename `sessions.json` → `sessions.json.bak`
5. Rename `state.json` → `state.json.bak`

## Risks / Trade-offs

**[Pi ownership boundary]** Dashboard writes to `~/.pi/agent/sessions/` which is pi's territory. → Mitigation: `.meta.json` is already a dashboard file (pi doesn't read or write it). The naming convention is established. If pi ever adds its own metadata, it would use a different filename.

**[Lossy directory encoding]** The `encodeCwd` function maps `/foo/bar-baz` and `/foo/bar/baz` to the same directory name. → Mitigation: The real cwd is stored in `.meta.json` (cached from `.jsonl` header). Directory name is only used for filesystem grouping, not cwd resolution.

**[Startup scan scales linearly]** Scanning all directories and reading all `.meta.json` files is O(n) in session count. → Mitigation: Benchmarked at 34ms for 171 sessions. Even at 1000 sessions, this would be ~200ms — well within acceptable startup time.

**[Stale `.meta.json` without `.jsonl`]** If a `.jsonl` is deleted but `.meta.json` remains, the session would be restored as a ghost. → Mitigation: During scan, only process `.meta.json` files that have a corresponding `.jsonl` file. Orphaned `.meta.json` files are ignored.

**[Migration failure]** If migration crashes mid-way, some `.meta.json` files may be written while old files aren't renamed. → Mitigation: Migration is idempotent. On next startup, it will detect old files still exist and re-run. Existing `.meta.json` files are merged (not overwritten) so partial runs are safe.

**[`sessionOrder` stale entries]** `sessionOrder` in `preferences.json` may reference session IDs that no longer exist. → Mitigation: `getOrder()` already accepts a `validIds` filter. Stale entries are harmless and filtered at read time.
