## Why

The dashboard's empty state (`LandingPage`) is a dead-end: a π glyph and "Select a session to get started". A first-run user has no sessions *to* select, and nothing on the page tells them:

1. They need LLM credentials before a session can actually do work.
2. They need to pin a folder before they can spawn a session.
3. Where the "spawn" button lives once they have a folder.

Today these three steps are scattered across `/settings?tab=providers`, the sidebar "Add folder" button (buried inside `SessionList`), and the per-folder `+Session` in `FolderActionBar`. A new user has to discover them in order, with no cues.

## What Changes

- **Replace the minimal `LandingPage` with a 3-step onboarding view** rendered whenever the main pane is empty (no selected session, terminal, editor, or settings).
  - Step ① **Setup credentials** → navigates to `/settings?tab=providers`.
  - Step ② **Add folder** → opens the existing `PinDirectoryDialog`.
  - Step ③ **Start session** → spawns a session in the first pinned folder (gated until step 2 is done).
- **Each step shows live state**: "pending" (full card with description + CTA), "done" (collapsed one-line ✔ with the satisfying value, e.g. "✔ 2 providers connected"), "locked" (visible but disabled with an explanation of the unmet prerequisite). Returning users with everything set up see three compact ✔ rows — not a wall of onboarding.
- **Lift `PinDirectoryDialog` mounting from `SessionList` up to `App.tsx`** so both the sidebar "Add folder" button and the new LandingPage step can trigger it from one source of truth. Sidebar behaviour is unchanged; it just asks App to open the dialog instead of owning the state.
- **Add a client-side `useProvidersReady()` hook** that consults both `/api/providers` (OpenAI-style baseUrl+apiKey config entries) and `/api/provider-auth/status` (pi OAuth / API-key credentials in `~/.pi/agent/auth.json`). Returns `ready=true` if either source has ≥1 authenticated/keyed entry; tolerates one endpoint failing. Used by Step ①'s done/pending state.
- **Preserve current LandingPage fallback behaviour** — if the user has already selected a session and then closes it, they still land here; the cards simply reflect whatever state currently applies.

## Capabilities

### New Capabilities
- `landing-page-onboarding`: a first-run guidance surface that narrates the three steps needed to go from install → first running session, and collapses into a compact status strip once each step is satisfied.

### Modified Capabilities
- `pinned-directories-ui`: `PinDirectoryDialog` mount/state moves from `SessionList` into `App.tsx`; sidebar button and new LandingPage button share one opener. Behaviour of the dialog itself is unchanged.

## Impact

- **Affected code**
  - `packages/client/src/components/LandingPage.tsx` — rewrite into the 3-card onboarding view; accept props `{ providersReady, pinnedCount, sessionsCount, firstPinnedCwd, onOpenPinDialog, onSpawnSession, navigate }`.
  - `packages/client/src/App.tsx` — add LandingPage props, own the `PinDirectoryDialog` open/close state, compute `firstPinnedCwd` from pinned groups, use existing `/api/providers` fetch via new hook.
  - `packages/client/src/components/SessionList.tsx` — remove local `showPinDialog` state and the `<PinDirectoryDialog>` mount; accept `onOpenPinDialog` prop and call it from the "Add folder" button. Keep the button visually identical.
  - `packages/client/src/hooks/useProvidersReady.ts` — new hook wrapping the existing `/api/providers` endpoint; returns `{ ready: boolean, count: number, loading: boolean }`.
  - `packages/client/src/components/__tests__/LandingPage.test.tsx` — new tests for the three visibility states (pending / done / locked) and CTA wiring.
  - `packages/client/src/components/__tests__/routing.test.tsx` — extend to assert LandingPage renders the onboarding cards in the empty state.
  - Optional: `packages/client/src/components/__tests__/SessionList.test.tsx` — update to reflect that `PinDirectoryDialog` is no longer mounted internally.
- **APIs**: no new server endpoints. Reuses existing `/api/providers`, `/api/provider-auth/status`, existing `pin_directory` WebSocket message, existing spawn path.
- **Security**: none — no new network surface.
- **Dependencies**: none added.
- **Out of scope** (flagged for future work):
  - A full multi-step wizard (modal, forced linear flow). This change keeps the empty state informational, not modal.
  - Showing per-provider names or counts in the ✔ label (e.g. "Anthropic OAuth + OpenAI key"). First cut: "Credentials configured" vs "Setup credentials".
  - Hiding the onboarding cards entirely for power users (a user-visible dismiss). Can be added later if the compact ✔ state is still too noisy.
  - Reusing the cards on mobile with a different layout; mobile will stack vertically by default and can be tuned in a follow-up if needed.
  - Changing `SettingsPanel` tabs or the providers tab UX.
