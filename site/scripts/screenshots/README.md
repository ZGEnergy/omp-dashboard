# Screenshot pipeline

Playwright-driven capture of every feature panel at desktop and mobile
viewports, into `site/public/screenshots/{desktop,mobile}/`.

## Quick start

### Option A — against your running dashboard (recommended)

```bash
# with your real dashboard running at e.g. http://localhost:8000
SCREENSHOT_TARGET_URL=http://localhost:8000 npm run screenshots
```

This uses your real sessions, real diffs, real flow activity. The best-quality
shots come from this path.

### Option B — against a fresh, fixture-seeded dashboard

```bash
npm run screenshots
```

This spawns a temporary `pi-dashboard` on a random port with a temp `HOME`,
seeds a handful of fixture sessions (see `fixtures/sessions.json`), captures,
and cleans up. The resulting screenshots are less rich than Option A but are
fully reproducible.

Requires `pi-dashboard` to be on `PATH`.

## Viewports

Declared in `viewports.ts`:

- **Desktop** — 1440 × 900, 2× DPR, dark mode
- **Mobile** — 390 × 844, 3× DPR, touch, dark mode

## Routes

Declared in `routes.ts`. Keep this in sync with `site/src/content/features.ts`
so feature cards always have matching images.

## Outputs

```
site/public/screenshots/
├── desktop/
│   ├── sessions.png
│   ├── chat.png
│   ├── flows.png
│   ├── terminal.png
│   ├── diff.png
│   ├── openspec.png
│   ├── packages.png
│   ├── settings-providers.png
│   └── tunnel-qr.png
└── mobile/
    ├── session-list.png
    ├── chat.png
    ├── action-menu.png
    └── qr.png
```

Generated PNGs are committed to git. The CI deploy job does **not**
regenerate them — the capture step is explicitly local/manual.

## When to re-run

- A feature panel's UI changes in a visible way.
- New feature added to `features.ts`.
- Before tagging a release.

## Troubleshooting

- **Playwright browsers missing**: `npx playwright install chromium`.
- **Server won't start in Option B**: check `pi-dashboard --version`; it must
  be on your `PATH`.
- **Some routes 404**: Option B's fixtures don't simulate everything. Use
  Option A with a live dashboard for full coverage.
