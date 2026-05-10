## Context

The honcho plugin's per-card surface today claims three slots: `session-card-memory` (twice — for `HonchoBadge` and `HonchoCardActions`) and `anchored-popover` (for `HonchoMapPopover`). The Interview button manages its own ad-hoc popover *inside* `HonchoCardActions` using `position: absolute` against the button's wrapper.

Both popovers suffer from clipping, cramped inputs, and z-index fragility. Every other input-bearing dashboard surface uses `DialogPortal`. This change aligns honcho with the dashboard convention.

## Goals / Non-Goals

**Goals**
- Replace both card-level popovers with `DialogPortal`-based dialogs.
- Multi-line textarea for Interview (paragraph-length preferences are the common case).
- Pre-fill, Save, Clear, and Cancel for Map-name in a roomy form (≥ 360 px on desktop).
- Drop the `anchored-popover` slot claim — no longer needed.
- Match dashboard styling (`var(--bg-secondary)`, `var(--border)`, mdi icons).

**Non-Goals**
- No changes to REST endpoints, plugin server entry, or `HonchoPluginStatus`.
- No changes to `HonchoBadge`, `HonchoSettings`, or any settings-section UI.
- No new slot ids. No changes to the plugin runtime.
- No change to the Sync button's behaviour.

## Decisions

### D1: Single shared dialog primitive — `DialogPortal`

`packages/client/src/components/DialogPortal.tsx` already exists and is used by `PinDirectoryDialog`, `BranchSwitchDialog`, `GroupedAttachDialog`, `PackageInstallConfirmDialog`, `QrCodeDialog`. The honcho plugin will import it through the existing `@blackbelt-technology/pi-dashboard-shared` re-export path (or, if not yet re-exported, add a re-export entry — design D1a).

**Why DialogPortal:**
- Renders at `document.body` → not clipped by the session-card's `overflow-hidden`.
- Scroll-locks the backdrop → no accidental page-scroll while typing.
- Handles Esc-to-close, backdrop click-to-close, focus management.
- Already passes the dashboard's a11y bar (used by every other input-bearing dialog).

**D1a — Re-export**: if `DialogPortal` is not yet in `@blackbelt-technology/pi-dashboard-shared`, add a re-export. This is a 1-line change to that package's `index.ts`. Plugin code imports `DialogPortal` from the shared package, never from `packages/client/`.

### D2: Two dialogs, not one

Considered: a single generic `HonchoCardDialog` component with a `mode: "interview" | "map-name"` prop.

Rejected because:
- The bodies are different shapes (multi-line textarea vs. single-line input + clear button).
- The save handlers hit different endpoints (`/interview` POST vs. `/sessions` POST/DELETE).
- The success behaviours differ (interview clears the textarea + closes; map-name closes immediately on save).

Decision: ship two thin components — `HonchoInterviewDialog` and `HonchoMapNameDialog` — each ~50 lines, each owning its own form state. Shared chrome (header, close button, footer button row) lives inline; we do not extract a `HonchoDialogShell` for two call sites (DRY-of-three rule from `AGENTS.md`).

### D3: State ownership — local to `HonchoCardActions`

Considered: a context provider that tracks "which card has a dialog open".

Rejected because:
- `DialogPortal` already enforces single-modal semantics via the backdrop (you cannot click another card's button while a dialog's backdrop is up).
- React 19 + `useState` per card is simpler and matches `BranchSwitchDialog`'s pattern in the dashboard's session card.

Decision: `HonchoCardActions` keeps two `useState<boolean>` flags (`interviewOpen`, `mapOpen`). Mounting either dialog mounts the portal; closing unmounts it.

### D4: Drop `anchored-popover` slot claim

The `anchored-popover` slot was created for honcho's map-name popover originally (its first and currently only consumer). Removing the claim removes the only honcho consumer of the slot; the slot definition itself stays in the runtime for future plugins.

**Migration path**: bump `pi-memory-honcho-dashboard` to v0.4.0. Plugin manifest in `package.json` drops the `anchored-popover` entry from `claims[]`. The runtime no longer routes anchored-popover requests to honcho. There is no user-visible regression because the only thing that used to anchor was honcho's own button, and that button now opens its own dialog directly.

### D5: Interview textarea sizing

Decision: `<textarea rows={6}>` — roughly 6 lines of context. Resizable vertically (`resize-vertical` Tailwind class). Min height 120 px, max height 50 vh on desktop, 60 vh on mobile. This matches `LinkSessionsDialog` from the openspec plugin, which solved the same "user wants to write a paragraph" problem.

Empty input disables Save. Whitespace-only input disables Save (matches the existing popover behaviour).

### D6: Map-name dialog form

Decision: single `<input type="text">` pre-filled with `hosts.pi.sessions[cwd]` or the derived default (computed via the existing `sessionStrategy` resolver in the plugin server — fetched on dialog mount via the existing `GET /api/plugins/honcho/config` endpoint, since the cwd-to-name resolver is already part of the redacted config response).

Three buttons in the footer:
- **Save** — `POST /api/plugins/honcho/sessions { cwd, name }`. Disabled when input matches the existing mapping (no-op writes are silly). Disabled when input is empty (use Clear instead).
- **Clear mapping** — `DELETE /api/plugins/honcho/sessions { cwd }`. Visible only when a mapping exists. Clears the input and closes the dialog on success.
- **Cancel** — closes without writing.

### D7: Mobile breakpoint

Decision: same as the dashboard's other dialogs — Tailwind's `sm:` (640 px). Below 640 px width the dialog goes full-screen (no rounded corners, full inset). At and above 640 px it centers at 480 px wide with rounded corners and a backdrop. `DialogPortal` already implements this; we just supply the inner content.

### D8: Dialog open while session card unmounts

If the user closes the session (kill / shutdown) while the dialog is open, the dialog should close. Pattern: the dialog's parent (`HonchoCardActions`) is a child of the session card's MEMORY subcard. When the card unmounts, React unmounts `HonchoCardActions`, which unmounts the dialog state, which unmounts the portal. No special handling needed.

If the dialog is mid-`POST` when the card unmounts, the in-flight fetch resolves into a no-op (the resolved-after-unmount pattern; we already guard against `setState` after unmount via `useEffect` cleanup in `HonchoInterviewDialog`).

## Risks / Trade-offs

- **Bigger DOM on every card**: each `HonchoCardActions` instance now renders two `<DialogPortal>` placeholders (mounted only when open). Cost: zero when closed (portal returns `null`). Negligible when open.
- **Anchored-popover slot suddenly unused**: future plugins can still claim it. We do not delete the slot definition or its runtime support — only honcho's claim. The slot stays a public extension point.
- **Plugin manifest version bump**: dropping a slot claim is a contract change visible to manifest consumers. Bumping minor (v0.4.0) signals it cleanly. No upstream consumer reads the manifest in a way that breaks on missing claims.
- **Test churn**: tests that assert "popover opens above the button" become "dialog opens via portal". This is a clear improvement (portal-based assertions are easier and less DOM-positional) but does require touching ~3 test files.
- **Backdrop covers the chat list while the dialog is open**: this is the same trade-off every other dashboard dialog already makes. Users dismiss with Esc or backdrop click.

## Migration Plan

1. Add `DialogPortal` re-export to `@blackbelt-technology/pi-dashboard-shared` if not already present (D1a).
2. Implement `HonchoInterviewDialog.tsx` and `HonchoMapNameDialog.tsx` in `packages/honcho-plugin/src/client/`.
3. Replace inline popover JSX in `HonchoCardActions.tsx` with the two new dialog mounts.
4. Delete `HonchoMapPopover.tsx` and its export from `index.tsx`.
5. Drop `anchored-popover` claim from `packages/honcho-plugin/package.json` manifest.
6. Update `manifest-discoverability.test.ts` to assert exactly two slots claimed: `settings-section`, `session-card-memory` (×2).
7. Bump plugin to v0.4.0 in `package.json` and `CHANGELOG.md`.

## Open Questions

- **Q1**: Should the Interview dialog also offer a "categorise as preference / fact / project-context" radio? Punted: out of scope, file as follow-up.
- **Q2**: Should the dialog persist a draft if the user closes it accidentally? Punted: not in scope; existing popover already loses input on outside-click. No regression.
