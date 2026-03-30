## Context

A code review uncovered 3 security vulnerabilities, 9 failing tests, and type safety issues across the codebase. All fixes are localized — no architectural changes or new patterns required. The codebase already has the right abstractions (e.g., `shellEscape()` exists but isn't used everywhere).

## Goals / Non-Goals

**Goals:**
- Eliminate all 3 security vulnerabilities (command injection, 2× XSS)
- Fix all 9 failing tests to restore green CI
- Remove `null as any` casts in event-status-extraction by fixing the type
- Add missing message types to `BrowserToServerMessage` to eliminate `as any` casts in client `send()` calls

**Non-Goals:**
- Refactoring App.tsx into smaller components (separate change)
- Eliminating all 81 `as any` casts project-wide (only fixing the protocol-related ones)
- Adding CSP headers or other defense-in-depth measures (separate change)

## Decisions

### D1: Shell-escape tmux command arguments

**Decision:** Apply the existing `shellEscape()` function to `cwd` and `sessionFile` in `buildTmuxCommand`.

**Rationale:** The function already exists and is used in the headless path. Reusing it maintains consistency. No new dependency needed.

**Alternative considered:** Switch `buildTmuxCommand` to use `execFile` with array arguments. Rejected because tmux's command syntax requires a shell string for the `-c` window command — there's no clean way to avoid shell interpolation with tmux.

### D2: DOMPurify for SVG sanitization

**Decision:** Add `dompurify` as a dependency and sanitize mermaid SVG output before injecting via `dangerouslySetInnerHTML`.

**Rationale:** DOMPurify is the industry standard for HTML/SVG sanitization (~2KB gzipped). Mermaid's own output is generally safe, but LLM-generated input could craft diagrams that produce SVG with embedded scripts. DOMPurify strips `<script>`, event handlers (`onload`, etc.), and other XSS vectors while preserving valid SVG.

**Alternative considered:** CSP `script-src` restriction. Rejected as defense-in-depth only — doesn't prevent all SVG-based attacks and requires server-side header changes.

### D3: HTML entity escaping for auth pages

**Decision:** Create a small `escapeHtml()` helper and apply it to all user-provided data interpolated into server-rendered HTML (email in denied page, any future cases).

**Rationale:** Minimal, zero-dependency fix. Only 5 characters need escaping (`& < > " '`). No need for a templating engine — the auth pages are simple server-rendered strings.

### D4: Fix `currentTool` type to allow `null`

**Decision:** Change `DashboardSession.currentTool` from `string | undefined` to `string | null | undefined`. Update `SessionUpdates` type accordingly. Remove `as any` casts.

**Rationale:** The code intentionally uses `null` (not `undefined`) because `undefined` is dropped during JSON serialization, which would prevent clearing the value on the browser side. The type should reflect the actual runtime behavior.

### D5: Add missing `BrowserToServerMessage` variants

**Decision:** Add the missing message types (`extension_ui_response`, `resume_session`, `spawn_session`, `create_terminal`, `kill_terminal`, `rename_terminal`, `reorder_sessions`, `pin_directory`, `unpin_directory`, `reorder_pinned_dirs`) to the `BrowserToServerMessage` union in `browser-protocol.ts`.

**Rationale:** These messages are already handled by the server's `browser-gateway.ts` switch statement — the types just weren't added to the union. This is a pure type fix with no runtime impact.

## Risks / Trade-offs

- **[Risk] DOMPurify strips valid SVG features** → Mitigation: DOMPurify's default config preserves standard SVG elements. Only scripts and event handlers are stripped, which are never needed for diagram rendering.
- **[Risk] Shell escaping changes tmux command behavior for paths with special characters** → Mitigation: The `shellEscape()` function only adds quotes around strings with special characters. Normal paths (`/Users/foo/project`) pass through unchanged.
- **[Risk] Test fixes may mask real behavioral changes** → Mitigation: Each test fix is verified against the actual implementation to confirm the test expectation was stale, not the implementation.
