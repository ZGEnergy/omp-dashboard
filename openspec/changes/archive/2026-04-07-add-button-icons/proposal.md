## Why

Many buttons across the dashboard UI use plain text labels, emoji characters (📋, 📄, ▶, ✕, ×, ←, ↻), or Unicode symbols instead of MDI icons. This is inconsistent with the existing `mdi-icon-system` spec which mandates MDI icons replace all emoji icons. Adding MDI icons to all remaining buttons improves visual consistency, scannability, and accessibility.

## What Changes

- Add MDI icons to ~40+ buttons that currently use only text labels or emoji/Unicode characters
- Replace emoji characters (📋, 📄) and Unicode symbols (✕, ×, ←, ↻, ▶, ▼, +) with proper MDI `<Icon>` components
- Keep text labels alongside icons for clarity (icon + text pattern) where space permits
- Icon-only for small/compact buttons (close ×, expand/collapse toggles)

### Buttons to update (by component):

**Dialog close/cancel/confirm buttons** (~12 instances):
- `ExploreDialog`: ✕ close → `mdiClose`; Cancel; Explore → `mdiCompassOutline`
- `NewChangeDialog`: ✕ close → `mdiClose`; Cancel; Send → `mdiSend`
- `ConfirmDialog`: Cancel; Confirm → `mdiCheck`
- `FlowLaunchDialog`: Cancel; Run → `mdiPlay`
- `BranchPicker`: Cancel
- `BranchSwitchDialog`: Cancel; Checkout → `mdiSourceBranchCheck`
- `PackageInstallConfirmDialog`: Cancel (already has Install icon)

**Session action buttons** (~8 instances):
- `SessionCard`: Resume → `mdiPlayCircleOutline`; Fork → `mdiSourceFork`
- `SessionHeader`: Attach → `mdiPaperclip`; Detach × → `mdiLinkOff`; Flow ▶ → `mdiPlay`; Changed Files 📄 → `mdiFileCompare`
- `SessionFlowActions`: ▶ Run Flow → `mdiPlay`; + New Flow → `mdiPlus`

**Flow controls** (~3 instances):
- `FlowDashboard`: Auto toggle → `mdiRobotOutline`; Abort → `mdiStop`; collapse → `mdiChevronUp`

**Content view buttons** (~6 instances):
- `FileDiffView`: ← Back → `mdiArrowLeft`; Files → `mdiFileTree`; ↻ Refresh → `mdiRefresh`; Retry → `mdiRefresh`
- `MarkdownPreviewView`: ← Back → `mdiArrowLeft`
- `ZrokInstallGuide`: ← Back → `mdiArrowLeft`

**Diff panel toggles** (~4 instances):
- `DiffPanel`: Diff/File → `mdiCompare`/`mdiFileOutline`; Split/Unified → `mdiViewSplitVertical`/`mdiViewSequential`

**Expand/collapse toggles** (~2 instances):
- `FolderOpenSpecSection`: ▼/▶ → `mdiChevronDown`/`mdiChevronRight`; Archive → `mdiArchiveOutline`; Specs → `mdiFileDocumentOutline`

**Other buttons** (~5 instances):
- `TerminalView`: ✕ close → `mdiClose`
- `FlowSummary`: Dismiss → `mdiCloseCircleOutline`
- `CommandInput`: × remove image → `mdiClose`
- `ProviderAuthSection`: Continue → `mdiArrowRight`; Add Key → `mdiKeyPlus`
- `SettingsPanel`: Check for Updates → `mdiUpdate`

## Capabilities

### New Capabilities

_(none — this extends the existing icon system)_

### Modified Capabilities

- `mdi-icon-system`: Extend coverage to all remaining text-only and emoji buttons across dialog, session, flow, diff, and settings components.

## Impact

- **Code**: ~20 client component files gain MDI icon imports and `<Icon>` elements
- **Dependencies**: No new dependencies — uses existing `@mdi/js` + `@mdi/react`
- **Bundle size**: Minimal increase — MDI icons are tree-shaken SVG paths
- **Visual**: All buttons gain consistent icon treatment; text labels preserved where appropriate
- **Breaking changes**: None — purely additive visual enhancement
