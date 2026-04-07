## Context

The dashboard already uses `@mdi/js` + `@mdi/react` extensively (~30+ components). Many buttons were added incrementally and use plain text, emoji, or Unicode characters instead of MDI icons. The `mdi-icon-system` spec mandates MDI icons replace all emoji icons, but coverage is incomplete.

## Goals / Non-Goals

**Goals:**
- Add MDI icons to all remaining text-only and emoji/Unicode buttons
- Maintain consistent icon + text pattern across the UI
- Keep changes minimal — only add `<Icon>` elements, no layout restructuring

**Non-Goals:**
- Redesigning button layouts or spacing
- Creating custom icon components or wrappers
- Changing button behavior or functionality
- Touching buttons that already have MDI icons

## Decisions

### 1. Icon + text for labeled buttons, icon-only for compact buttons

Buttons with visible text labels (Cancel, Send, Run, etc.) get an icon prepended inline. Small action buttons (close ×, expand/collapse) become icon-only.

**Rationale**: Matches the existing pattern used by SettingsPanel (Save icon + text), PackageCard (Download icon + text), and TerminalCard (icon-only close).

### 2. Consistent icon sizing

Use `size={0.45}` for compact/card buttons (matching existing TerminalCard, SessionCard pattern) and `size={0.5}` for dialog buttons. Inline text buttons use `size={0.4}` with `className="inline mr-0.5"`.

**Rationale**: Matches existing size conventions already established across the codebase.

### 3. Cancel buttons get no icon, just text

Cancel buttons remain text-only. They are secondary actions and adding icons would add visual noise without improving clarity.

**Alternative considered**: `mdiCancel` or `mdiClose` icon — rejected because Cancel is universally understood as text, and the primary action button (with icon) should draw more attention.

### 4. Group changes by component file

Each component file is an independent unit of work. Changes within a file are: add MDI import, add `<Icon>` element inside button JSX. No cross-file dependencies.

**Rationale**: Simplifies review, testing, and rollback.

## Risks / Trade-offs

- **[Risk] Bundle size increase** → Minimal; MDI paths are ~200 bytes each, tree-shaken. ~30 new icon paths ≈ 6KB uncompressed.
- **[Risk] Visual density** → Adding icons to already-compact buttons could feel cluttered. Mitigation: use small sizes (0.4–0.5) and only prepend, don't restructure.
- **[Risk] Emoji removal breaks character search** → Users searching for 📋 or 📄 in code won't find buttons. Mitigation: keep descriptive title/aria-label attributes.
