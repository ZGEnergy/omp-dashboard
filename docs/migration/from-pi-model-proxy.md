# Migration: from @blackbelt-technology/pi-model-proxy to dashboard proxy

## Overview

`@blackbelt-technology/pi-model-proxy` is a pi extension that binds an OpenAI-compatible HTTP server on `:9876` inside each pi session. The dashboard's built-in proxy serves the same endpoints on `:8000/v1` (the dashboard port), without requiring a pi session to be open.

## Differences

| Dimension | pi-model-proxy (extension) | Dashboard proxy (built-in) |
|---|---|---|
| Lifecycle | Bound to a single pi session | Runs as long as the dashboard server runs |
| Default port | `:9876` | `:8000` (path prefix `/v1`) |
| Auth | Optional, configurable per-install | Required proxy API keys (`pi-proxy-*`) |
| Multi-session | Only one session can bind `:9876` | Always one — the dashboard server |
| Model catalog | Session's `ModelRegistry` | Dashboard's `InternalRegistry` (same sources) |
| OAuth refresh | pi-coding-agent's `AuthStorage` | `InternalAuthStorage` + `provider-auth-storage.ts` |

## URL migration

```bash
# Before (pi-model-proxy)
OPENAI_BASE_URL=http://localhost:9876/v1

# After (dashboard proxy)
OPENAI_BASE_URL=http://localhost:8000/v1
```

## Key migration

The upstream pi-model-proxy optionally accepts a hardcoded `apiKey` in its extension config. The dashboard proxy issues dedicated proxy API keys:

1. Open Settings → API Proxy in the dashboard.
2. Enable the proxy toggle.
3. Click **+ New API key**, give it a label.
4. Copy the revealed cleartext key (shown once).
5. Set `OPENAI_API_KEY=pi-proxy-<your-key>` in your client's environment.

## Coexistence

Running both at the same time is supported — different ports, different auth. Both will forward requests to the same `~/.pi/agent/auth.json` credentials. No interference occurs.

**Recommendation:** pick one to reduce complexity. To disable the upstream extension:

```bash
# Remove from pi settings
pi settings packages remove npm:@blackbelt-technology/pi-model-proxy
# or manually edit ~/.pi/agent/settings.json and remove the entry from packages[]
```

Then restart pi sessions to stop the upstream server from binding `:9876`.

## Second port option

If your SDK assumes a port-only base URL (no `/v1` path prefix), configure `modelProxy.secondPort` in the dashboard config:

```json
{
  "modelProxy": {
    "enabled": true,
    "secondPort": 9876
  }
}
```

This binds a second Fastify instance on `127.0.0.1:9876` serving only `/v1/*` — drop-in replacement for the upstream extension's default port.

## Decision matrix

| Situation | Recommendation |
|---|---|
| Running pi without the dashboard | Keep `pi-model-proxy` extension |
| Running the dashboard, always-on proxy needed | Use dashboard proxy, disable extension |
| Need `:9876` for SDK compatibility | Set `modelProxy.secondPort: 9876`, disable extension |
| Coexistence acceptable for now | Leave both running, migrate at convenience |
