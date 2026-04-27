# Pi Dashboard REST API Reference

Base URL: `http://localhost:{port}` (default port: `8000`, configurable in `~/.pi/dashboard/config.json`).

All responses use JSON. Mutation endpoints require `Content-Type: application/json`.

---

## Health & Status

### `GET /api/health`
Server liveness check.

**Response:**
```json
{ "ok": true, "pid": 12345, "uptime": 3600 }
```

### `GET /auth/status`
Check authentication status.

**Response (auth disabled):**
```json
{ "authenticated": true, "authEnabled": false }
```

---

## Sessions

### `GET /api/sessions`
List all sessions.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "cwd": "/path/to/project",
      "name": "my-session",
      "source": "tui",
      "status": "active",
      "model": "claude-sonnet-4-20250514",
      "startedAt": 1711900000000,
      "tokensIn": 5000,
      "tokensOut": 1200,
      "cost": 0.05,
      "currentTool": "Edit",
      "gitBranch": "main",
      "hidden": false
    }
  ]
}
```

**Session fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique session identifier |
| `cwd` | string | Working directory |
| `name` | string? | User-assigned name |
| `source` | string | Origin: `tui`, `zed`, `tmux`, `dashboard`, `terminal`, `unknown` |
| `status` | string | `active`, `idle`, `streaming`, `ended` |
| `model` | string? | Current model name |
| `thinkingLevel` | string? | Current thinking level |
| `startedAt` | number | Unix timestamp (ms) |
| `endedAt` | number? | Unix timestamp (ms) when ended |
| `tokensIn` | number? | Total input tokens |
| `tokensOut` | number? | Total output tokens |
| `cost` | number? | Total cost in USD |
| `currentTool` | string? | Currently executing tool name |
| `gitBranch` | string? | Current git branch |
| `attachedProposal` | string? | Attached OpenSpec change name |
| `hidden` | boolean? | Whether session is hidden |
| `activeFlowName` | string? | Running flow name |
| `flowStatus` | string? | `running`, `success`, `error`, `aborted` |
| `sessionFile` | string? | Path to session JSONL file |

---

## Session Control

### `POST /api/session/:id/prompt`
Send a text prompt to a session.

**Body:**
```json
{ "text": "your prompt message", "images": [] }
```
- `text` (required): Prompt text
- `images` (optional): Array of `{ type: "image", data: "base64...", mimeType: "image/png" }`

**Responses:**
- `200`: `{ "success": true }`
- `400`: Missing `text`
- `404`: Session not found
- `502`: No bridge connection (session not connected to dashboard)

### `POST /api/session/:id/abort`
Abort the current operation in a session.

**Body:** `{}`

**Responses:**
- `200`: `{ "success": true }`
- `404`: Session not found

### `POST /api/session/:id/shutdown`
Shut down a pi session (terminates the process, not the server).

**Body:** `{}`

**Responses:**
- `200`: `{ "success": true }`
- `404`: Session not found

### `POST /api/session/:id/rename`
Rename a session.

**Body:**
```json
{ "name": "new-session-name" }
```

**Responses:**
- `200`: `{ "success": true }`
- `400`: Missing `name`
- `404`: Session not found

### `POST /api/session/:id/hide`
Hide a session from the default view.

**Body:** `{}`

**Responses:**
- `200`: `{ "success": true }`
- `404`: Session not found

### `POST /api/session/:id/unhide`
Unhide a previously hidden session.

**Body:** `{}`

**Responses:**
- `200`: `{ "success": true }`
- `404`: Session not found

### `POST /api/session/spawn`
Spawn a new pi session in a directory.

**Body:**
```json
{ "cwd": "/path/to/project" }
```

**Responses:**
- `200`: `{ "success": true, "data": { "message": "..." } }`
- `400`: Missing `cwd`
- `500`: Spawn failed

### `POST /api/session/:id/resume`
Resume or fork an ended session.

**Body:**
```json
{ "mode": "continue" }
```
- `mode`: `"continue"` (resume same session) or `"fork"` (create a new branch from this session)

**Responses:**
- `200`: `{ "success": true, "data": { "message": "..." } }`
- `400`: Invalid `mode` or missing session file
- `404`: Session not found
- `409`: Session is still active or already resuming
- `500`: Spawn failed

---

## Flow Control

### `POST /api/session/:id/flow-control`
Control a running flow.

**Body:**
```json
{ "action": "abort" }
```
- `action`: `"abort"` or `"toggle_autonomous"`

**Responses:**
- `200`: `{ "success": true }`
- `400`: Invalid `action`
- `404`: Session not found

---

## Model Configuration

### `POST /api/session/:id/model`
Set the model for a session.

**Body:**
```json
{ "provider": "anthropic", "modelId": "claude-sonnet-4-20250514" }
```

**Responses:**
- `200`: `{ "success": true }`
- `400`: Missing `provider` or `modelId`
- `404`: Session not found

### `POST /api/session/:id/thinking-level`
Set the thinking level for a session.

**Body:**
```json
{ "level": "high" }
```

**Responses:**
- `200`: `{ "success": true }`
- `400`: Missing `level`
- `404`: Session not found

---

## OpenSpec

### `POST /api/session/:id/attach-proposal`
Attach an OpenSpec change proposal to a session. Auto-names the session if unnamed.

**Body:**
```json
{ "changeName": "add-new-feature" }
```

**Responses:**
- `200`: `{ "success": true }`
- `400`: Missing `changeName`
- `404`: Session not found

### `POST /api/session/:id/detach-proposal`
Detach the currently attached proposal from a session.

**Body:** `{}`

**Responses:**
- `200`: `{ "success": true }`
- `404`: Session not found

### `GET /api/openspec-archive?cwd=CWD`
List archived OpenSpec changes for a directory.

**Response:**
```json
{
  "success": true,
  "data": [
    { "name": "add-feature", "date": "2025-01-15", "path": "openspec/changes/archive/2025-01-15-add-feature" }
  ]
}
```

---

## Git Operations

All git endpoints are **localhost-only**.

### `GET /api/git/branches?cwd=CWD`
List git branches.

**Response:**
```json
{
  "success": true,
  "data": {
    "current": "main",
    "detached": false,
    "branches": [
      { "name": "main", "isRemote": false, "isCurrent": true },
      { "name": "origin/main", "isRemote": true, "isCurrent": false }
    ]
  }
}
```

### `POST /api/git/checkout`
Checkout a branch.

**Body:**
```json
{ "cwd": "/path", "branch": "feature-branch", "stash": false }
```

**Responses:**
- `200`: `{ "success": true, "data": { "stashed": false } }`
- `409`: Dirty working tree (returns `{ "success": false, "dirty": true, "files": [...] }`)

### `POST /api/git/init`
Initialize a git repository.

**Body:** `{ "cwd": "/path" }`

### `POST /api/git/stash-pop`
Pop the most recent stash.

**Body:** `{ "cwd": "/path" }`

**Response:** `{ "success": true, "data": { "conflicts": false } }`

---

## Files & Browse

### `GET /api/file?cwd=CWD&path=RELPATH`
Read a file or list a directory (localhost-only).

**Response (file):**
```json
{ "success": true, "data": { "type": "file", "content": "file contents..." } }
```

**Response (directory):**
```json
{ "success": true, "data": { "type": "directory", "entries": ["file1.ts", "dir/"] } }
```

### `GET /api/browse?path=PATH&q=QUERY&detect=0|1`
Browse directories (localhost-only).

By default this is a single-`readdir` enumeration with no per-entry filesystem probes — `isGit` and `isPi` are **absent** from each entry. Pass `detect=1` (only the literal string `"1"` is truthy) to opt into eager `.git` / `.pi` classification on every entry. For batch classification of an arbitrary set of paths, prefer `GET /api/browse/flags`. (See change: split-browse-flags.)

**Response (default, `detect` absent):**
```json
{
  "success": true,
  "data": {
    "current": "/Users/me/projects",
    "parent": "/Users/me",
    "entries": [
      { "name": "my-app", "path": "/Users/me/projects/my-app" }
    ]
  }
}
```

**Response (with `detect=1`):**
```json
{
  "success": true,
  "data": {
    "current": "/Users/me/projects",
    "parent": "/Users/me",
    "entries": [
      { "name": "my-app", "path": "/Users/me/projects/my-app", "isGit": true, "isPi": true }
    ]
  }
}
```

### `GET /api/browse/flags?paths=JSON_ARRAY`
Bulk-classify a list of absolute paths as git repositories and/or pi projects (localhost-only). The `paths` query is a URL-encoded JSON array of absolute path strings (length ≤ 100).

Per-path probe failures (ENOENT, EACCES, ELOOP, race-on-deletion, target removed mid-probe) map to `{ isGit: false, isPi: false }` for that key — the call itself never throws on per-path failures. Only malformed input or over-cap arrays produce a top-level error (HTTP 400).

**Example request:**
```bash
curl --get "$BASE/api/browse/flags" --data-urlencode \
  'paths=["/Users/me/projects/my-app","/Users/me/projects/scratch"]'
```

**Response (success):**
```json
{
  "success": true,
  "data": {
    "flags": {
      "/Users/me/projects/my-app": { "isGit": true, "isPi": true },
      "/Users/me/projects/scratch": { "isGit": false, "isPi": false }
    }
  }
}
```

**Errors (HTTP 400):**
- `{ "success": false, "error": "invalid paths" }` — missing, empty, not JSON, not an array, or array contains non-strings.
- `{ "success": false, "error": "too many paths" }` — array length > 100.

### `GET /api/readme?cwd=CWD`
Read README.md from a directory (localhost-only).

---

## Events

### `GET /api/events/:sessionId/:seq`
Fetch a specific event by sequence number.

**Response:**
```json
{
  "success": true,
  "data": {
    "eventType": "tool_use",
    "timestamp": 1711900000000,
    "data": { "toolName": "Edit", "input": "..." }
  }
}
```

### `GET /api/session-diff?sessionId=ID`
Get file changes made during a session (localhost-only).

**Response:**
```json
{
  "success": true,
  "data": {
    "isGitRepo": true,
    "files": [
      {
        "path": "src/app.ts",
        "changes": [{ "type": "edit", "timestamp": 1711900000000, "message": "Add feature" }],
        "gitDiff": "--- a/src/app.ts\n+++ b/src/app.ts\n..."
      }
    ]
  }
}
```

---

## Configuration

### `GET /api/config`
Read server configuration (redacted secrets, localhost-only).

### `PUT /api/config`
Update server configuration (partial merge, localhost-only).

**Body (any subset):**
```json
{
  "port": 8000,
  "autoShutdown": true,
  "shutdownIdleSeconds": 300,
  "spawnStrategy": "headless",
  "tunnel": { "enabled": true }
}
```

---

## Tunnel

### `GET /api/tunnel-status`
Check tunnel status.

**Response:**
```json
{ "status": "active", "url": "https://abc.share.zrok.io", "serverOs": "darwin" }
```
Status can be `active`, `inactive`, or `unavailable`.

### `POST /api/tunnel-connect`
Create a tunnel connection.

### `POST /api/tunnel-disconnect`
Disconnect the active tunnel.

---

## Known Servers

### `GET /api/known-servers`
List persisted known remote servers from config.

**Response:**
```json
{ "success": true, "data": [{ "host": "office-mac", "port": 8000, "label": "Office", "addedAt": "2024-01-15T10:30:00Z" }] }
```

### `POST /api/known-servers`
Add or update a known server. Deduplicates by host:port (updates label on duplicate).

**Body:**
```json
{ "host": "office-mac", "port": 8000, "label": "Office" }
```

**Response:** `{ "success": true }`

### `DELETE /api/known-servers`
Remove a known server by host:port. Idempotent.

**Body:**
```json
{ "host": "office-mac", "port": 8000 }
```

**Response:** `{ "success": true }`

### `POST /api/discover-servers`
On-demand mDNS network scan. Returns currently discovered peer servers.

**Response:**
```json
{ "success": true, "data": [{ "host": "192.168.1.42", "port": 8000, "piPort": 9999, "version": "1.2.3", "pid": 123, "isLocal": false }] }
```

---

## Server Lifecycle

### `POST /api/shutdown`
Shut down the dashboard server (localhost-only). Flushes persistence before exit.

**Response:** `{ "ok": true }`

---

## Pi Resources

### `GET /api/pi-resources?cwd=CWD`
List discovered extensions, skills, and prompts (localhost-only).

### `GET /api/pi-resource-file?path=FILEPATH`
Read a pi resource file (localhost-only, restricted to allowed locations).

### `GET /api/editors?path=CWD`
Detect available editors (localhost-only).

### `POST /api/open-editor`
Open a file in an editor (localhost-only).

**Body:**
```json
{ "path": "/project", "editor": "vscode", "file": "src/app.ts", "line": 42 }
```

---

## Pinned Directories

### `GET /api/pinned-dirs`
List pinned directories.

**Response:**
```json
{ "success": true, "data": ["/path/to/project1", "/path/to/project2"] }
```
