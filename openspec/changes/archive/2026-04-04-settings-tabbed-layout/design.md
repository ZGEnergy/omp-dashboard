## Context

The SettingsPanel is a single ~400-line component rendering 8 sections in one scrollable column. The header (back, title, Restart, Save) is inside the scroll container, so it disappears when scrolling down. All state (config, llmProviders, save logic) lives in the top-level component. Sub-components (Section, NumberField, ToggleField, etc.) are local to the file.

The outer layout uses `overflow-y-auto` on the root `div`, meaning everything scrolls together.

## Goals / Non-Goals

**Goals:**
- Split settings into 4 tabs: General, Providers, Security, Advanced
- Fix header + tab bar at top so Save/Restart are always reachable
- Preserve all existing save logic (partial diff, combined config + LLM provider save)
- Keep the change minimal — refactor layout, don't rewrite business logic

**Non-Goals:**
- Extracting tab content into separate files (can do later if tabs grow)
- Adding new settings fields
- Changing server API or config shape
- URL hash persistence for active tab (nice-to-have, not required)

## Decisions

### 1. Tab state via `useState` — not URL routing

Simple `useState<string>("general")` for active tab. The settings page is a single route already; adding hash-based tab routing adds complexity for minimal benefit. Can be added later if deep-linking becomes needed.

**Alternative considered**: `wouter` nested routes or URL hash — rejected as over-engineering for 4 tabs.

### 2. Fixed header via flex layout restructure

Current:
```
<div overflow-y-auto>     ← everything scrolls
  <header />
  <content />
</div>
```

New:
```
<div flex-col h-full>     ← no scroll on outer
  <header />              ← fixed (shrink-0)
  <tab-bar />             ← fixed (shrink-0)
  <content overflow-y-auto flex-1 />  ← only this scrolls
</div>
```

No `position: sticky` or `fixed` needed — pure flexbox.

### 3. Tab content as inline conditional blocks

Each tab renders its sections inline via `{activeTab === "general" && (<>...</>)}`. No separate components needed — the sections are already small. This keeps the diff minimal.

### 4. Tab bar styling

Simple horizontal button row with bottom border. Active tab gets an accent underline (blue-500, 2px) and brighter text. Matches the existing dashboard visual language (no new design patterns).

### 5. Message banner stays below tab bar, above content

The save success/error/warn message renders between the tab bar and the scrollable content area so it's always visible regardless of scroll position.

## Risks / Trade-offs

- **[Risk] Tab grouping may feel wrong for some users** → Mitigated by choosing intuitive labels and grouping related concepts. Can rearrange later without structural changes.
- **[Risk] Scroll position resets on tab switch** → Acceptable for settings pages; each tab is short enough that this isn't annoying.
- **[Trade-off] All tab content still in one file** → Keeps the diff small. If individual tabs grow large, they can be extracted into separate components later.
