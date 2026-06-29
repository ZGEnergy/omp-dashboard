# iroh transport research — is it worth it for bridge / server / client comms?

**Date:** 2026-06-25
**Status:** Research / explore-mode note. No implementation.
**Verdict:** Not worth it now. Revisit only for the Electron remote-mode path.

## Question

Is it worth adopting [iroh](https://iroh.computer/) for pi-dashboard bridge ↔ server ↔ client communication?

## Current topology (three legs)

```
┌─────────────┐   WS :9999    ┌──────────────┐   WS :8000   ┌─────────────┐
│ pi + bridge │ ────────────▶ │  Dashboard   │ ◀──────────  │   Browser   │
│ (extension) │   localhost   │   Server     │  localhost   │   (React)   │
│  Node.js    │               │  Node.js     │  or zrok     │  Chromium   │
└─────────────┘               └──────────────┘              └─────────────┘
   same host                    same host                   remote = zrok
   no NAT                       no NAT                       tunnel + OAuth
```

- **Leg A — bridge → server (WS :9999):** both ends Node.js, same machine. Reconnect/backoff/replay already solved. No NAT, no internet hop.
- **Leg B — browser → server (WS :8000):** client is a Chromium browser (or Electron renderer). Local or via tunnel.
- **Leg C — remote access:** only leg crossing NAT/internet. Today = zrok reserved share + OAuth + tunnel-watchdog + trusted-networks + JWT.

## What iroh is

Rust library for direct peer-to-peer QUIC connections with NAT holepunching, relay fallback, TLS 1.3, dial-by-public-key. Every endpoint speaks QUIC over UDP by default.

JS support = `@number0/iroh` **NAPI native bindings, Node.js only** (per-platform prebuilt binaries, Node ≥ 20.3). Browser/WASM support is partial and still routes over **relay WebSockets** — no holepunching inside a browser tab.

## Mapping iroh onto each leg

| Leg | Problem iroh solves? | Verdict |
|---|---|---|
| **A** bridge↔server | Same-host localhost. No NAT, no transport pain. | ❌ Zero value. Pure overhead. |
| **B** browser↔server | Client is Chromium. Native iroh can't run in a browser; WASM falls back to relay+WS anyway. | ❌ Can't even apply it. |
| **C** remote access | NAT traversal — iroh's home turf. But the consumer is a browser, which still can't dial iroh natively. | ⚠️ Only if a native client existed. |

## Core blocker

iroh wins when **both peers run native code** behind NATs. pi-dashboard's remote leg always terminates in a **web browser** — exactly what iroh's native QUIC stack can't run in. The one place P2P matters (Leg C) is the one place you can't use the good part of iroh. You'd be stuck on iroh's relay-over-WebSocket path — what zrok already gives, minus the mature reserved-URL / OAuth / trusted-network / watchdog layer already built.

## Narrow future niche (the only one)

```
  Electron desktop (native Node main)  ──iroh QUIC──▶  remote Docker server (Node)
              │                                                  │
              └── renderer talks WS to its OWN localhost main ───┘
```

If the **Electron main process** (native Node) became a local proxy that dials the remote server over iroh, and the renderer kept talking plain WebSocket to `localhost` inside Electron, then iroh replaces zrok for desktop-app remote mode: no public URL, no tunnel daemon, dial-by-key auth.

Caveats:
- Helps only the Electron remote path, not browser-from-phone.
- Parallel transport, not a replacement — zrok still needed for "open dashboard in any browser."
- Adds a native Rust dependency + per-platform binaries to an Electron build already fighting bundling / immutable-bundle complexity.

## Recommendation

- **Now:** do not adopt. Two of three legs are localhost Node↔Node (no transport problem); remote leg dead-ends in a browser.
- **Revisit if:** Electron remote mode becomes a priority and killing the public-tunnel dependency is desired → spike "iroh in Electron main as localhost↔remote QUIC proxy."

## Sources

- https://iroh.computer/ , https://github.com/n0-computer/iroh
- https://docs.iroh.computer/languages/javascript (`@number0/iroh` NAPI bindings)
- https://docs.iroh.computer/concepts/nat-traversal , .../concepts/relays
- https://kerkour.com/iroh-v1-p2p (deep dive: building block, bring your own protocol)
