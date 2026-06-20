# Tasks

## 1. Fix the responsive wrapper

- [x] 1.1 In `packages/client/src/components/SettingsPanel.tsx` (~line 571), change the nav/content wrapper className from `flex-1 flex min-h-0` to `flex-1 flex flex-col md:flex-row min-h-0`.

## 2. Verify in browser

- [x] 2.1 At 390 px viewport (`/settings/general`): confirm wrapper `flex-direction: column`, content panel width > 0 and fully on-screen, nav renders as a horizontal scrollable strip on top.
- [x] 2.2 At ≥ `md` (e.g. 1024 px): confirm no regression — nav is the `w-56` vertical rail on the left, content fills the right.
- [x] 2.3 Spot-check a content-heavy page (e.g. Developer / Providers) scrolls within the content area while header stays fixed.

## 3. Build & ship

- [x] 3.1 `npm run build` (client change → production rebuild required).
- [x] 3.2 `curl -X POST http://localhost:8000/api/restart` to serve the rebuilt client.
