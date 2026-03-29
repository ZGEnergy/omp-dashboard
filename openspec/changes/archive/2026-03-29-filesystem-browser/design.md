## Context

The current `PinDirectoryDialog` uses a plain text input for path entry. The pinned directories system lets users pin directories that always appear in the sidebar, even with zero sessions. Pinning currently requires typing the exact path — a PathPicker widget with zsh-style typeahead would make this much easier and is reusable for future directory selection needs.

## Goals / Non-Goals

**Goals:**
- Build a keyboard-first PathPicker component combining text input + visual directory list
- Integrate it with `PinDirectoryDialog`
- Make the component reusable

**Non-Goals:**
- File content browsing (only directories)
- Remote filesystem access (localhost-only)
- Changes to pinned directory storage or ordering

## Decisions

### 1. Browse API endpoint
**Decision**: Add `GET /api/browse?path=<dir>` (localhost-only) returning `{ entries: Array<{ name, path, isGit, isPi }>, parent: string | null, current: string }`. Lists only directories (no files). Entries sorted alphabetically. Hidden directories (starting with `.`) excluded. Defaults to home directory if no path given. Capped at 200 entries.

**Rationale**: Simple REST endpoint. `isGit` and `isPi` flags let the list show visual hints for project directories.

### 2. PathPicker component — unified input + browser
**Decision**: Single component with a text input on top and a fixed-height scrollable directory list below (8 rows). The input is always focused — the list is a visual projection, not a focusable element. The list shows children of the last complete path segment in the input, filtered by the partial text after the last `/`.

**Layout:**
```
┌────────────────────────────────────────────┐
│ /Users/robson/Project/pi-▌                 │  ← always focused
└────────────────────────────────────────────┘
┌────────────────────────────────────────────┐
│  ⬆ ..                                     │
│  📁 pi-agent-dashboard     🟢 ⚡  ██████ │  ← highlighted
│  📁 pi-coding-agent        🟢 ⚡          │
│  📁 pi-tools               🟢             │
│                                            │
│                                            │
│                                            │
│                                            │  ← fixed 8 rows
└────────────────────────────────────────────┘
```

**Rationale**: Mirrors zsh tab completion — type to filter, Tab to descend, Enter to confirm. One widget, no mode switching between "typing" and "browsing". Focus stays in input so keyboard users never lose their place.

### 3. Keyboard model
**Decision**:

| Key | Action |
|-----|--------|
| Typing | Extends partial filter, resets highlight to first match |
| ↓ / ↑ | Move highlight through list |
| Tab | Accept highlighted entry → descend (input = parent + entry + `/`, fetch new dir) |
| Enter | Confirm current input path = select |
| Esc | Cancel / close |
| Backspace past `/` | Go up one level — re-fetch parent directory, partial = leftover text |

**Critical distinction**: Tab descends (like zsh completion), Enter confirms (like zsh execute).

**Single match**: When only one entry matches the partial, Tab auto-completes it without needing ↓ first.

**Rationale**: Terminal users expect Tab = complete, Enter = execute. Arrow keys for list navigation is standard.

### 4. API call strategy
**Decision**: Fetch from API only when the resolved parent directory changes. Partial typing does client-side filtering of the cached entry list.

```
Input: /Users/robson/Pro▌
                    ^^^^  ← client-side filter
       ^^^^^^^^^^^^^^     ← fetched when /Users/robson/ was resolved
```

**Triggers for API call**:
- Initial open (fetch home dir or `initialPath`)
- Tab / click descends into a directory
- Backspace past `/` changes the parent
- Paste resolves deepest valid directory

**Rationale**: Avoids per-keystroke API calls. Feels snappy since filtering is instant.

### 5. Component API
**Decision**:
```tsx
<PathPicker
  initialPath="/Users/robson/"   // starting directory
  onSelect={(path) => ...}       // user confirmed a path (Enter)
  onCancel={() => ...}           // user pressed Esc
  rows={8}                       // visible list rows
/>
```

**Rationale**: Minimal API. PinDirectoryDialog becomes a thin wrapper. Reusable for any directory selection need.

### 6. Edge cases
**Decision**:
- **Empty directory**: Show only `..` and a subtle "No subdirectories" hint
- **No filter matches**: Show `..` and "No matches" hint
- **Invalid path typed**: Show error state, no list entries
- **Paste full path**: Parse, resolve deepest valid directory, show its contents, set partial to remaining text
- **`..` entry**: Always present as first row (except at root `/`)
- **Root directory**: `..` not shown, `parent` is null

**Rationale**: `..` always available ensures users can always navigate up. Error/empty states keep the UI stable.

### 7. Select button
**Decision**: PathPicker includes a "Select" button below the list. Both Enter key and the Select button confirm the current path. The button is disabled when the input is empty.

**Rationale**: Keyboard users use Enter, mouse users click Select. Both paths converge to `onSelect`.

### 8. Integration with PinDirectoryDialog
**Decision**: Replace the text input in `PinDirectoryDialog` with `<PathPicker>`. The dialog provides the title and calls `onPin` with the selected path. PathPicker handles all navigation internally, including Cancel/Select buttons.

**Rationale**: PinDirectoryDialog becomes trivial — just a dialog shell around PathPicker.

## Risks / Trade-offs

- **[Performance]** → Large directories could return many entries. Mitigation: 200-entry cap, alphabetical sort, hidden dirs excluded, client-side filtering.
- **[Security]** → Browse endpoint exposes directory structure. Mitigation: localhost-only guard, no file content, directories only.
- **[Keyboard complexity]** → Tab key normally moves focus in web apps. Mitigation: `preventDefault()` on Tab when PathPicker is active. This is expected behavior for a completion widget.
