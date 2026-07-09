## Context

The invoicebot-plugin mounts REST routes under `/api/plugins/invoicebot/*` on the
dashboard's Fastify server (`routes.ts`). Today all four routes are `POST` with a
JSON envelope and a `cwd` in the body; they proxy to an `InvoiceEngine` port
(`query`/`review`/`setup`/`rules`). The engine (`@blackbelt-technology/invoicebot`)
stores each retained original at `resolve(stateDir(), "blobs/<hash>_<basename>")`
and emits `surface.original = { blob_handle, path, available:true }`. No route
returns bytes, so the pointer is a dead end for a browser.

`stateDir()` resolves to `<cwd>/.pi/flows/invoicebot-state`. The plugin already
receives `cwd` on every request, so it can reconstruct the blob directory without
new engine surface.

## Goals / Non-Goals

**Goals:**
- Stream a retained original's bytes over HTTP so the browser's native viewer can
  render it (PDF, PNG, JPEG).
- Contain all filesystem access inside the request workspace's `blobs/` directory.
- Support range requests for large-PDF lazy paging.
- Keep the engine untouched (it already provides handle + path).

**Non-Goals:**
- Authentication/authorization beyond the plugin's existing LAN-trust posture
  (documented assumption; revisit when dashboard auth lands).
- Signed/expiring URLs, CDN, or caching layer.
- Rendering, thumbnailing, or format conversion — the browser renders; we only serve.
- Non-file blob sources (remote object stores) — out of scope; blobs are on disk.

## Decisions

**D1 — GET with query params, not POST envelope.** The browser's native PDF/image
viewer needs a plain URL it can put in `<iframe src>`/`<img src>` and issue GET +
Range against. A POST envelope cannot back an `<iframe>`. So this one route breaks
the envelope convention deliberately: `GET /api/plugins/invoicebot/blob?cwd=…&handle=…`.

**D2 — Resolve + contain, then serve.** Compute
`root = resolve(cwd, ".pi/flows/invoicebot-state/blobs")` and
`target = resolve(root, basename-safe handle)`. Require
`target === root/… ` i.e. `resolveReal(target)` starts with `resolveReal(root) + sep`.
Reject otherwise. This defeats `../` traversal, absolute-path handles, and symlink
escape (resolve real paths before the prefix check). The engine's handle is
`blobs/<hash>_<name>`; accept either the full `blobs/…` handle or the bare filename
and normalize.

**D3 — Content-Type by extension, inline disposition.** Map `.pdf/.png/.jpg/.jpeg`;
default `application/octet-stream`. Set `Content-Disposition: inline; filename="…"`
so previewable types render in-browser and unknown types download. Filename is the
sanitized basename.

**D4 — Range support via Fastify stream + `Accept-Ranges`.** Honor `Range` with
`206` + `Content-Range`; full body otherwise with `Content-Length`. Use a read
stream, not a full-buffer read, to bound memory on large PDFs.

**D5 — Status codes.** `400` missing/invalid `cwd`/`handle` or bad workspace dir;
`403` containment violation; `404` file absent; `200`/`206` on success.

## Risks / Trade-offs

- **Arbitrary file read (highest risk).** Mitigated by D2 real-path containment.
  Tests MUST include `../` traversal, absolute handle, and symlink-escape cases.
- **`cwd` in URL (info leak).** The workspace filesystem path appears as a query
  param in browser history/logs. Acceptable under the existing LAN-trust posture;
  noted as a follow-up when auth lands. No secret material is in the path.
- **Convention break (GET vs envelope).** One route diverges from the POST-envelope
  pattern; documented in `api-contract.md` so future readers aren't surprised.
- **MIME sniffing.** We set explicit `Content-Type` and `X-Content-Type-Options:
  nosniff` to stop the browser from re-interpreting bytes as HTML/script.
