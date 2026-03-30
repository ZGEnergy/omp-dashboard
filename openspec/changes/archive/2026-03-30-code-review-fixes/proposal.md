## Why

A comprehensive code review uncovered 3 security vulnerabilities (command injection, 2 XSS vectors), 9 failing tests from code-test drift, and widespread `as any` type workarounds. These issues pose real risk for any deployment beyond localhost and erode type safety across the codebase. Fixing them now prevents security incidents and stops technical debt from compounding.

## What Changes

- **Fix command injection in `buildTmuxCommand`**: Apply `shellEscape()` to `cwd` and `sessionFile` parameters that are currently interpolated raw into shell strings passed to `execSync`.
- **Fix XSS in MermaidBlock**: Sanitize SVG output from `mermaid.render()` with DOMPurify before injecting via `dangerouslySetInnerHTML`.
- **Fix XSS in auth denied page**: HTML-escape the `email` parameter in `renderDeniedPage()` before interpolating into the HTML template.
- **Fix 9 failing tests**: Update stale test expectations — `spawnStrategy` default changed from `"tmux"` to `"headless"`, `currentTool` clearing uses `null` not `undefined`, and other test-code drift.
- **Fix `null as any` type workaround**: Update `DashboardSession.currentTool` type to `string | null` and remove `as any` casts in `event-status-extraction.ts`.
- **Add missing message types to `BrowserToServerMessage`**: The 11 `as any` casts in `App.tsx` on `send()` calls indicate missing types in the protocol union — add them so the client is fully typed.

## Capabilities

### New Capabilities

_None — all changes are fixes to existing capabilities._

### Modified Capabilities

- `process-manager`: Shell-escape `cwd` and `sessionFile` in tmux command building to prevent command injection.
- `mermaid-diagram`: Sanitize SVG output before DOM injection to prevent XSS.
- `oauth-authentication`: HTML-escape user-provided data in server-rendered auth pages.
- `shared-protocol`: Add missing `BrowserToServerMessage` variants so client `send()` calls are fully typed.

## Impact

- **Server** (`src/server/process-manager.ts`): `buildTmuxCommand` gains shell escaping — no API change, purely defensive.
- **Server** (`src/server/auth-plugin.ts`): `renderDeniedPage` escapes email — no API change.
- **Client** (`src/client/components/MermaidBlock.tsx`): Adds `dompurify` dependency for SVG sanitization.
- **Shared types** (`src/shared/types.ts`): `currentTool` type changes from `string?` to `string | null`.
- **Shared protocol** (`src/shared/browser-protocol.ts`): New message type variants added to `BrowserToServerMessage` union.
- **Tests**: 5 test files updated to match current implementation behavior.
- **Dependencies**: New devDependency `dompurify` + `@types/dompurify`.
