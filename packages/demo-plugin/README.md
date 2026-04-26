# @blackbelt-technology/demo-plugin

**This package is a runtime fixture. It SHALL NOT ship in production builds.**

It exists solely to exercise the `dashboard-plugin-runtime` end-to-end:
- `settings-section` claim: renders a small settings form in the General tab.
- `tool-renderer` claim: renders `tool_call` events with `toolName: "DashboardDemo"` as a green box.

## Usage in tests

```ts
import { createSlotRegistry } from "@blackbelt-technology/dashboard-plugin-runtime";
// The demo plugin's claims appear automatically via discoverPlugins() in test environments
```

## Production exclusion

The manifest declares `"fixture": true`. The `viteDashboardPluginsPlugin` filters out fixture
plugins when `NODE_ENV=production`, so no demo code appears in release builds.

## Deletion policy

This package is deleted (or kept as a test fixture) once at least one `extract-*-as-plugin`
change ships and provides a real plugin for end-to-end runtime validation.
