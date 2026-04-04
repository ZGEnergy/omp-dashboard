## Context

The dashboard has four UI issues: broken pasted images due to server-side string truncation, a sidebar collapse button buried in the header toolbar, a narrow default sidebar width, and redundant pin icons on folder cards. All are independent, low-risk changes touching different files with no shared dependencies.

The proposal covers a fifth item (image paste in all input renderers) that is deferred — it requires protocol changes across extension, server, and client.

## Goals / Non-Goals

**Goals:**
- Fix base64 image data corruption in the memory event store
- Move sidebar collapse affordance to the sidebar edge (vertically centered)
- Default sidebar width to maximum (500px) for first-time users
- Consolidate folder pin icons: folder open/closed on left, single toggle pin on right

**Non-Goals:**
- Image paste support in interactive renderers (deferred, needs protocol changes)
- Changing sidebar min/max width constants
- Changing the collapsed sidebar width (28px)
- Any server protocol or bridge extension changes

## Decisions

### D1: Skip truncation for image data fields by checking sibling keys

**Choice**: In `truncateStrings()`, when iterating object keys, skip truncation for a key named `"data"` if the parent object also contains a `"mimeType"` key.

**Alternatives considered**:
- *Blocklist specific event types*: Would require knowing all event types that carry images. Fragile.
- *Increase max string size globally*: Would increase memory usage for all events, not just images.
- *Strip images from stored events entirely*: Would lose image display on replay/reconnect.

**Rationale**: The `mimeType` sibling check is a precise signal that `data` contains binary content. It adds no overhead for events without images and requires no protocol knowledge.

### D2: Collapse button as overlay on drag handle

**Choice**: Render a small subtle chevron button absolutely positioned on the drag handle area of `ResizableSidebar`, vertically centered, always visible. When collapsed, vertically center the expand button.

**Alternatives considered**:
- *Show on hover only*: Less discoverable, users may not find it.
- *Double-click only*: Already exists but not discoverable.

**Rationale**: Hover-reveal matches common IDE patterns (VS Code, IntelliJ). The existing double-click-to-collapse on the drag handle is preserved as a secondary affordance.

### D3: Default sidebar width equals max width

**Choice**: Change `DEFAULT_WIDTH` from 256 to 500 (same as `MAX_WIDTH`).

**Rationale**: The sidebar contains folder groups, session cards, git info, OpenSpec sections, and action buttons. 256px truncates most content. 500px shows everything. Only affects users who have never resized (no localStorage value). Existing users keep their saved width.

### D4: Single pin icon on right, folder icon on left

**Choice**: Replace the left-side yellow pin icon (on pinned folders) and the 📁 emoji (on unpinned folders) with MDI folder icons: `mdiFolderOpen` when expanded, `mdiFolder` when collapsed. The right-side icon becomes a single `mdiPin` that toggles: yellow when pinned (click to unpin), muted when unpinned (click to pin).

**Alternatives considered**:
- *Remove pin icon entirely, use background color*: Less accessible, harder to click.
- *Keep both icons with different semantics*: Current state — redundant.

**Rationale**: The folder icon conveys collapse state (open/closed), the pin icon conveys and controls pin state. Each icon has one job.

### D5: Stronger selected session card indicator

**Choice**: Replace the subtle `border-l-2 border-l-blue-500/40` with a combination of full border color, background tint, and ring: `border-blue-500/60 bg-blue-500/5 ring-1 ring-blue-500/30`.

**Alternatives considered**:
- *Bold background change*: Too heavy, would clash with status-based pulse animations.
- *Left accent bar only but thicker/brighter*: Better than current but still easy to miss when scrolling.

**Rationale**: The combination of border + tint + ring creates a clear "glow" effect that's immediately recognizable without being distracting. It follows the existing blue accent pattern used elsewhere in the UI (input focus, active badges).

## Risks / Trade-offs

- **[Image data memory]** Preserving full base64 strings means image-heavy sessions use more memory. → Mitigation: Images are rare in typical usage; the per-session event cap and LRU eviction still bound total memory.
- **[Sidebar width regression]** Users who prefer a narrow sidebar must manually resize on first use. → Mitigation: Resizing is a one-time action persisted to localStorage.
- **[Hover collapse discoverability]** Some users may not discover the hover-reveal collapse button. → Mitigation: Double-click on drag handle still works; collapsed state has a visible expand button.
