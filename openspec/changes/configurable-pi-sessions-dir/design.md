# Design — configurable-pi-sessions-dir

## Problem framing

Two processes, one truth. pi writes session JSONL under a dir it resolves at launch. The dashboard
is a **separate** long-lived process that scans that dir. Today the dashboard hardcodes the default;
when pi's dir moves, the dashboard goes blind.

```
pi process (per invocation)              dashboard server (long-lived)
─────────────────────────────           ──────────────────────────────
--session-dir flag        ──┐
PI_CODING_AGENT_SESSION_DIR ─┤
settings.json#sessionDir   ─┼─► writes JSONL ──► ??? ◄── scans  HARDCODED ~/.pi/agent/sessions
PI_CODING_AGENT_DIR/sessions ┤
~/.pi/agent/sessions       ──┘
```

The dashboard cannot observe a *per-invocation* `--session-dir` of some other pi. It can only resolve
one global sessions root. So the design picks the **durable, process-independent** signals.

## Resolution precedence (chosen)

```
resolvePiSessionsDir(env?):
  1. config.json#piSessionsDir         (operator's explicit dashboard override)   ← highest
  2. process.env.PI_CODING_AGENT_SESSION_DIR  (inherited by dashboard process)
  3. piCoreGetSessionsDir()            (= getAgentDir()/sessions; honors
                                          PI_CODING_AGENT_DIR; falls back to
                                          ~/.pi/agent/sessions)                    ← lowest
```

Each layer: tilde-expand, trim; whitespace-only string is "unset" and falls through.

### Why reuse pi's `getSessionsDir()` instead of re-deriving

- Already a dependency (`packages/server/package.json` → `@earendil-works/pi-coding-agent@^0.80.2`).
- pi's helper = `join(getAgentDir(), "sessions")`, and `getAgentDir()` honors `PI_CODING_AGENT_DIR`
  (`config.js:411`). Importing it means the `~/.pi/agent` ↔ `PI_CODING_AGENT_DIR` floor stays correct
  forever, even if pi changes the layout.
- DRY: removes three copies of `join(os.homedir(), ".pi", "agent", "sessions")`.

`packages/shared` does NOT currently depend on pi-core. Two options:
- **A (chosen)**: keep the resolver in `dashboard-paths.ts` but accept the pi-core sessions dir as an
  injected fallback param, and have the *server* (which already has the dep) pass
  `piCoreGetSessionsDir()` in. Keeps `shared` dependency-light + testable.
- B: add the pi-core dep to `shared`. Heavier; rejected — shared is intentionally lean.

Shape:

```ts
// packages/shared/src/dashboard-paths.ts
export type DashboardPathsEnv = ManagedPathsEnv & {
  piSessionsDir?: string;          // from config.json
  sessionDirEnv?: string;          // injected process.env.PI_CODING_AGENT_SESSION_DIR
  piCoreSessionsDir?: string;      // injected pi-core getSessionsDir() result
};

export function resolvePiSessionsDir(env?: DashboardPathsEnv): string {
  const pick = (s?: string) => { const t = s?.trim(); return t ? expandTilde(t, env) : undefined; };
  return pick(env?.piSessionsDir)
    ?? pick(env?.sessionDirEnv ?? process.env.PI_CODING_AGENT_SESSION_DIR)
    ?? env?.piCoreSessionsDir
    ?? path.join(env?.homedir ?? os.homedir(), ".pi", "agent", "sessions");  // last-ditch literal
}
```

Server call site:

```ts
// session-scanner.ts
import { getSessionsDir as piCoreGetSessionsDir } from "@earendil-works/pi-coding-agent";
import { resolvePiSessionsDir } from "@pi-dashboard/shared";

export function getSessionsDir(): string {
  return resolvePiSessionsDir({
    piSessionsDir: loadConfig().piSessionsDir,
    piCoreSessionsDir: piCoreGetSessionsDir(),
  });
}
```

## Tilde expansion

pi already exposes `expandTildePath`. To avoid coupling `shared` to pi, the resolver does minimal
`~/`-prefix expansion against `homedir` locally (matches existing `dashboard-paths.ts` style of
`env.homedir ?? os.homedir()`). Absolute paths pass through untouched.

## Windows / Electron safety (maintainer concern)

- Resolver never hand-builds separators beyond `path.join`; absolute inputs pass through verbatim.
- pi-core's `getSessionsDir()` already returns native Windows paths.
- No symlink/junction assumptions added.
- Electron loads config via `loadMinimalConfig()` (`~/.pi/dashboard/config.json`); `piSessionsDir`
  is just another optional string field there — no new IPC.

## Test plan

Unit (`dashboard-paths` resolver), table-driven:

| config piSessionsDir | env SESSION_DIR | piCoreSessionsDir | expected |
|---|---|---|---|
| unset | unset | `/home/u/.pi/agent/sessions` | `/home/u/.pi/agent/sessions` |
| `/data/sess` | unset | `…` | `/data/sess` |
| unset | `/env/sess` | `…` | `/env/sess` |
| `  ` (blank) | `/env/sess` | `…` | `/env/sess` (blank skipped) |
| `~/mine` | unset | `…` | `<homedir>/mine` |
| `/data/sess` | `/env/sess` | `…` | `/data/sess` (config wins) |

Integration: point `piSessionsDir` at a temp fixture tree with `.meta.json` sidecars; assert
`scanAllSessions()` discovers them; assert default (all unset) still scans `~/.pi/agent/sessions`.

## Deferred decisions

- **`settings.json#sessionDir`** (pi's persistent per-user session-dir setting): pi reads it via its
  startup settings manager. Replicating that parse in the dashboard is a 4th precedence layer; deferred
  until a user reports relying on it. `PI_CODING_AGENT_DIR` covers the common relocate case.
- **`--session-dir` per-invocation flag**: structurally unobservable to a separate dashboard process.
  Out of scope.
- **Configurable `~/.pi/dashboard` root** (the issue's secondary ask): separate concern (the
  dashboard's own state dir, not pi's sessions). Not in this change.
- **Multi-root scanning** (watch several sessions dirs at once): not requested; single root only.
