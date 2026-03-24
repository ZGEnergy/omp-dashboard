## Context

The OpenSpec section renders inside the selected session card's accordion area. Currently it uses colored dots for artifact status, separate task count lines, and "In Progress"/"Completed" section headers. This is a pure client-side UI refactor of `OpenSpecSection.tsx`.

## Goals / Non-Goals

**Goals:**
- Collapse OpenSpec section by default, toggle with chevron
- Replace dots with colored letters P D S T
- Inline task count on the same line as change name
- Remove section headers, reduce vertical space

**Non-Goals:**
- No protocol, server, or bridge changes
- No new data requirements

## Decisions

### Decision 1: Collapsible via local React state

Use `useState(false)` for expanded state. The chevron (`▶`/`▼`) and "OpenSpec" label act as the toggle. Refresh button stays visible in both states. No persistence needed — collapsed is always the default.

### Decision 2: ArtifactLetters replaces ArtifactDots

New component `ArtifactLetters` renders `P D S T` (or whichever artifacts exist) with color classes:
- `done` → `text-green-500`
- `ready` → `text-yellow-500`
- `blocked` → `text-[var(--text-muted)]`

Letters are 10px bold monospace for alignment.

### Decision 3: Single-line change layout

Each change card becomes a flex row: `name (truncate) | letters | tasks`. Action buttons on a second row below. No wrapping card background needed — just subtle padding.

## Risks / Trade-offs

**[Trade-off]** Removing section headers means completed and in-progress changes are in one flat list. → Acceptable because the letter colors and task counts already convey status clearly.
