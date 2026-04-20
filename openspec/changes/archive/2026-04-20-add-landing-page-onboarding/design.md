## Context

`packages/client/src/components/LandingPage.tsx` is a 10-line placeholder shown in the main pane whenever nothing else is selected. `App.tsx` renders it in two places (desktop + mobile) via `sessionDetail ?? <LandingPage />`.

The three onboarding actions already exist, scattered:

| Step | Current trigger | Underlying call |
|------|-----------------|-----------------|
| Setup credentials | Sidebar ⚙ → Providers tab | Navigates to `/settings?tab=providers`; `SettingsPanel` reads `?tab=` and opens the matching section |
| Add folder | Sidebar "Add folder" button (`SessionList.tsx:500`) | Opens `PinDirectoryDialog` → `send({ type: "pin_directory", path })` |
| Start session | Per-folder `+Session` in `FolderActionBar` | `handleSpawnSession(cwd)` in `App.tsx` |

`SessionList` currently owns the `showPinDialog` state and mounts `PinDirectoryDialog` itself. Nothing outside `SessionList` can open the dialog today.

Providers are exposed by `GET /api/providers` which `SettingsPanel` already fetches. The response shape (based on `SettingsPanel.tsx`) is `{ success, providers: Record<string, { baseUrl, apiKey, api }> }`.

## Goals / Non-Goals

**Goals:**
- First-run user lands on a page that shows the three things to do, in order, with CTAs that work from that surface.
- Returning user with everything set up sees a compact status strip, not a wall of onboarding.
- One source of truth for "open pin dialog" — shared by sidebar and landing page.
- No new server endpoints.
- No behavioural regression for the existing sidebar "Add folder" flow.

**Non-Goals:**
- A modal wizard or forced linear flow.
- Fine-grained credential detection (OAuth vs API key vs per-provider validity).
- Mobile-specific layout beyond a default vertical stack.
- Hiding / dismissing the cards permanently.
- Changing `SettingsPanel` UX.
- Changes to session spawn semantics.

## Decisions

### D1. Three cards, each with three visual states

Each step renders one of three states, derived purely from props:

```
pending  →  full card (title, description, CTA button)
done     →  collapsed row: ✔ icon + one-line summary
locked   →  full card but CTA disabled, with "Requires: ..." hint
```

State derivation:

| Step | pending | done | locked |
|------|---------|------|--------|
| ① Creds | `!providersReady` | `providersReady` | never |
| ② Folder | `providersReady && pinnedCount === 0` | `pinnedCount > 0` | `!providersReady` |
| ③ Session | `pinnedCount > 0 && sessionsCount === 0` | `sessionsCount > 0` | `pinnedCount === 0` |

Rationale for gating Step ② on ① being done: showing "Add folder" to a user with no working LLM credentials is a trap — they'll pin a folder, spawn a session, and get an immediate failure. Making ② locked until ① is done tells the right story. (Users can still use the sidebar "Add folder" button at any time; the lock is only on the *LandingPage card CTA*, not on the underlying capability.)

### D2. Lift `PinDirectoryDialog` into `App.tsx`

Two alternatives considered:

- **A. Lift state into App.tsx** — `App` owns `pinDialogOpen`, passes `onOpenPinDialog` down to both `SessionList` and `LandingPage`, and mounts `<PinDirectoryDialog>` once. **Chosen.**
- **B. Mount a second `PinDirectoryDialog` in `LandingPage`** — simpler diff but introduces two mount sites and two onPin handlers. Rejected — duplication is an explicit code-style anti-pattern per project AGENTS.md (#8 DRY).
- **C. Custom window event or URL route** — overkill for a single dialog.

### D3. `useProvidersReady` hook

A thin fetch hook, mounted in `App.tsx` near existing bootstrap calls. It consults **two** endpoints and is ready if either has credentials:

1. `GET /api/providers` — OpenAI-style baseUrl+apiKey config entries (dashboard `providers` block). Condition: `some(p => p.apiKey?.trim().length > 0)`.
2. `GET /api/provider-auth/status` — pi OAuth / API-key credentials in `~/.pi/agent/auth.json` (returned as an array of `{ id, authenticated, ... }`). Condition: `some(s => s.authenticated === true)`.

`count` is the sum across both sources. Consulting both is necessary because OAuth flows (e.g. Anthropic login) do not populate the `/api/providers` block — they write directly to `auth.json`. Either endpoint failing is tolerated; the other source still drives readiness.

Polling: none. Refetch triggers (both endpoints):
- initial mount
- `window` focus (lightweight; user may have just finished OAuth in a popup tab)
- a custom `provider-auth-event` dispatched by `ProviderAuthSection` on successful auth (already referenced elsewhere for similar patterns).

### D4. Step ③ "Start session" target

When Step ③ is actionable, clicking "Start" calls `onSpawnSession(firstPinnedCwd)`. `firstPinnedCwd` is the top pinned directory from the existing `pinnedGroups` computation in `App.tsx`. We deliberately do not show a folder picker here — Step ② is the picker; Step ③ is the "go" button. If multiple pinned folders exist, we pick the first (same ordering shown in the sidebar).

### D5. Keep LandingPage rendering on every empty-pane navigation

No change to *when* LandingPage renders. The cards simply reflect current state. A returning user who closes their only session still lands here and sees three ✔ rows — which is fine: it's honest, minimal, and gives them a visible "Start session" button they might actually want.

### D6. Collapsed-done row content

- Step ① done: `✔ Credentials configured` (we intentionally don't show provider count yet — requires deeper inspection and the number is rarely useful; can add later).
- Step ② done: `✔ <N> folder(s) pinned`.
- Step ③ done: `✔ <N> active session(s)`.

## Visualisation

Empty state, first run (all pending except locked):

```
┌──────────────────────────────────────────────────────────┐
│                          π                               │
│                  Welcome to pi-dashboard                 │
│                                                          │
│   ┌───────────────┐  ┌───────────────┐  ┌─────────────┐ │
│   │ ① Setup       │  │ ② Add folder  │  │ ③ Start     │ │
│   │   credentials │  │   (locked)    │  │   session   │ │
│   │               │  │               │  │   (locked)  │ │
│   │ Connect an    │  │ Requires:     │  │ Requires:   │ │
│   │ LLM provider  │  │ credentials   │  │ a folder    │ │
│   │               │  │               │  │             │ │
│   │ [Open…]       │  │ [Add…]  ✕     │  │ [Start] ✕   │ │
│   └───────────────┘  └───────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Returning user, fully set up:

```
┌──────────────────────────────────────────────────────────┐
│                          π                               │
│           Pick a session on the left to continue         │
│                                                          │
│   ✔ Credentials configured                               │
│   ✔ 3 folders pinned                                     │
│   ✔ 2 active sessions                                    │
└──────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

- **`useProvidersReady` false negatives.** If OAuth stores a token without populating `apiKey`, Step ① stays "pending" forever. Mitigation: follow-up to consult `/api/auth/status` if reports surface. Low risk — the main providers tab already writes `apiKey` on OAuth completion for most flows.
- **Card noise for power users.** Three ✔ rows on an already-busy LandingPage. Mitigation: the rows are small and single-line; if it still annoys we can add a "hide onboarding" toggle (explicitly out of scope here).
- **Lifting `PinDirectoryDialog` changes sidebar internals.** Low risk — `SessionList` keeps its button and handler; only the dialog mount moves. Test coverage protects the sidebar path.
- **Step ② lock logic could confuse users who *want* to pin a folder before setting up creds.** Mitigation: the sidebar "Add folder" button stays unlocked; lock applies only to the LandingPage card CTA.

## Migration

None. No persisted data changes. No URL scheme changes. Pure client-side UI change plus one small state-lifting refactor.

## Open Questions

- Should Step ① done say `✔ Credentials configured` or `✔ <N> provider(s) configured`? Going with the former for first cut; trivial to change if `/api/providers` exposes enough to count reliably.
- Should Step ③ pick "first pinned" or "most recently pinned"? First for first cut (matches visual sidebar order). Revisit if users report surprise.
