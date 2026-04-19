# Screenshot fixtures

These JSON files are written to a temporary `~/.pi/agent/sessions/` when the
screenshot script runs in "spawn" mode, so the dashboard has something to
display in each panel.

For v1 the fixtures are intentionally minimal — real sessions produced during
dev work already make for better screenshots. The recommended workflow is:

1. Use the dashboard normally for a while with representative sessions open.
2. Run `SCREENSHOT_TARGET_URL=http://localhost:8000 npm run screenshots` from
   the repo root to capture against your live dashboard.

If the env var is unset, the script spawns a fresh server with these fixtures.
