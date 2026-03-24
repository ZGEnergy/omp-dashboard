## 1. Collapsible Section

- [x] 1.1 Add `expanded` state (`useState(false)`) to `OpenSpecSection`
- [x] 1.2 Render header line with chevron (`▶`/`▼`), "OpenSpec" label, and refresh button
- [x] 1.3 Toggle `expanded` on header click
- [x] 1.4 Conditionally render change list and "+ New Change" only when expanded
- [x] 1.5 Write test: section renders collapsed by default (only header visible)
- [x] 1.6 Write test: clicking header toggles expansion

## 2. Artifact Letters

- [x] 2.1 Replace `ArtifactDots` component with `ArtifactLetters` component
- [x] 2.2 Map artifact IDs to letters: proposal→P, design→D, specs→S, tasks→T, else→first letter uppercase
- [x] 2.3 Apply color classes: done→`text-green-500`, ready→`text-yellow-500`, blocked→`text-[var(--text-muted)]`
- [x] 2.4 Style letters as 10px bold monospace
- [x] 2.5 Add title tooltip with `"artifact-id: status"` on each letter
- [x] 2.6 Write test: letters render with correct text and color classes

## 3. Slim Change Card

- [x] 3.1 Refactor `ChangeCard` layout: single flex row with name (truncate), letters, and inline task count
- [x] 3.2 Move task count to end of first line (e.g., `2/5 tasks`)
- [x] 3.3 Action buttons on second line below name/letters/tasks
- [x] 3.4 Remove "In Progress" and "Completed" section headers from `OpenSpecSection`
- [x] 3.5 List changes flat: in-progress first, then completed
- [x] 3.6 Write test: task count appears inline, no section headers rendered
- [x] 3.7 Update existing tests to match new structure
