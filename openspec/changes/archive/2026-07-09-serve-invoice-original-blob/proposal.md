## Why

The invoicebot surface already carries a retained original document as a pointer
(`surface.original = { blob_handle, path, available }`), and the engine writes the
bytes to `<cwd>/.pi/flows/invoicebot-state/blobs/<handle>`. But no route streams
those bytes, so the dashboard's document lightbox has nothing to render — it can
only print the local filesystem path, which a browser cannot open. This is the
deferred gap **G3** (`add-invoicebot-rest-plugin` tasks §9.3): "Original-document
delivery — blob proxy endpoint serving `stateDir()/blobs/<handle>` for the request
`cwd`, path-traversal-guarded."

## What Changes

- Add a **GET** route `GET /api/plugins/invoicebot/blob` to the invoicebot-plugin
  that accepts `cwd` + `handle` query params, resolves the file under the request
  workspace's `blobs/` directory, and streams it with the correct `Content-Type`
  and `Content-Disposition: inline` (so the browser previews rather than downloads).
- **Path-traversal guard**: the resolved absolute path MUST stay inside
  `<cwd>/.pi/flows/invoicebot-state/blobs/`. Reject `..`, absolute handles, and
  symlink escape with `400`/`403`; missing file → `404`.
- Support HTTP **range requests** (`Range`/`206 Partial Content`) so the browser's
  native PDF viewer can page-in large documents lazily.
- Content-Type by extension: `.pdf → application/pdf`, `.png → image/png`,
  `.jpg/.jpeg → image/jpeg`; unknown → `application/octet-stream` (client shows a
  download link).
- This closes G3 §9.3 in `add-invoicebot-rest-plugin` (that task references this change).

## Capabilities

### New Capabilities
- `invoicebot-blob-delivery`: HTTP byte delivery of a retained invoice original
  document, scoped to a workspace's blob store, path-traversal-guarded, range-capable.

### Modified Capabilities
<!-- none: this is additive; the surface pointer shape is unchanged -->

## Discipline Skills
- `security-hardening`: the route reads a filesystem path from attacker-controllable
  `handle`/`cwd` input — path-traversal containment is the core requirement.
- `observability-instrumentation`: new external-facing route; log resolved handle,
  outcome (200/206/400/403/404), and reject reasons for prod diagnosis.

## Impact

- **New route**: `GET /api/plugins/invoicebot/blob` (previously only `POST` envelope
  routes existed: `/query`, `/review`, `/setup`, `/rules`).
- **Files**: `packages/invoicebot-plugin/src/server/routes.ts` (route),
  likely a small `blob.ts` helper (path resolution + guard + mime), tests under
  `packages/invoicebot-plugin/src/server/__tests__/`.
- **Engine**: no change — it already emits `blob_handle`/`path` and stores bytes.
- **Consumer**: unblocks `render-original-document-preview` in `invoice-bot-dashboard`.
