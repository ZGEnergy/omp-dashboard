## Context

The `openspec-folder-card-ui` change adds a `FolderOpenSpecSection` to folder group headers. This change adds a "New Spec" button to that section which spawns a new pi agent with `/opsx:explore` as the initial prompt. The existing `process-manager.ts` spawns sessions via tmux or headless mode but has no concept of an initial prompt. The `openspec-activity-detector.ts` detects phase and change names from tool events but misses the `openspec new change "name"` positional CLI syntax.

## Goals / Non-Goals

**Goals:**
- "New Spec" button on folder card spawns a pi agent that enters explore mode
- Process manager supports initial prompt passed as positional argument to pi CLI
- Activity detector catches `openspec new change "name"` immediately
- Auto-attach works when the explore session creates a proposal

**Non-Goals:**
- General-purpose "spawn with prompt" UI (this is specifically for OpenSpec explore)
- Changing auto-attach logic (already works once change name is detected)
- Custom explore topic input (just launches bare `/opsx:explore` — user can type context in the session)

## Decisions

### 1. Extend `SessionOptions` with `initialPrompt`

Add `initialPrompt?: string` to `SessionOptions`. When set:

- **tmux**: appended as positional argument to the pi command: `pi "the prompt"`
- **headless**: appended as positional argument after `--mode rpc`: `pi --mode rpc "the prompt"`

The prompt must be shell-escaped. Pi accepts initial prompts as positional arguments (confirmed: `pi [options] [messages...]`).

**Alternative considered:** Environment variable `PI_INITIAL_PROMPT`. Rejected — pi doesn't support this, and positional args are the documented approach.

**Alternative considered:** Queue prompt on server, send via bridge after connect. Rejected — adds complexity (pending prompt tracking, race conditions). Positional arg is simpler and immediate.

### 2. Extend `spawn_session` message instead of new message type

Add optional `initialPrompt?: string` to the existing `spawn_session` browser→server message rather than creating a new `spawn_spec_session` message type. Keeps the protocol simpler — it's the same operation (spawn) with an optional parameter.

### 3. Fix activity detector with new regex

Add `CLI_NEW_CHANGE_RE` to catch `openspec new change "name"`:

```typescript
const CLI_NEW_CHANGE_RE = /openspec\s+new\s+change\s+["']?([^\s"']+)["']?/;
```

This is checked in the Bash tool handler alongside the existing `CLI_CHANGE_FLAG_RE` and `CLI_ARCHIVE_RE` patterns. Catches the change name at creation time rather than waiting for the subsequent `openspec status --change` call.

### 4. "New Spec" button placement

The button renders in `FolderOpenSpecSection` next to Bulk Archive and Refresh. It's always visible (even when section is collapsed) because it's a primary action. Sends `spawn_session` with `cwd` and `initialPrompt: "/opsx:explore"`.

### 5. Auto-attach flow relies on existing logic

No changes to auto-attach. The flow:
1. Agent starts, reads `openspec-explore` SKILL.md → phase = "explore" detected
2. During explore, agent creates change → `openspec new change "name"` → changeName detected (with regex fix)
3. Server has both phase + changeName → auto-attach fires
4. Session gets attached, renamed to change name

## Risks / Trade-offs

- **[Risk] Shell escaping of initial prompt**: The prompt `/opsx:explore` contains special characters. → **Mitigation**: Reuse existing `shellEscape()` helper in process-manager. The `/` and `:` characters are safe.

- **[Risk] Tmux command quoting**: Embedding a quoted prompt inside a tmux command string requires careful escaping. → **Mitigation**: Test with tmux specifically. The prompt is simple ASCII text without quotes.

- **[Trade-off] No topic input dialog**: The "New Spec" button launches bare `/opsx:explore` without asking the user what to explore. → **Mitigation**: User can type context in the session chat after it starts. Adding a dialog is future work if needed.
