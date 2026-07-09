## 1. Blob path resolution + guard

- [x] 1.1 Add `src/server/blob.ts`: `resolveBlobPath(cwd, handle)` → `{ ok, abs }`
      or a typed rejection (`invalid-input` | `traversal` | `not-found`). Compute
      `root = resolve(cwd, ".pi/flows/invoicebot-state/blobs")`; accept a `blobs/…`
      handle or bare basename; `target = resolve(root, sanitized)`; require
      `realpath(target)` to start with `realpath(root) + sep`.
- [x] 1.2 `contentTypeFor(ext)`: `.pdf→application/pdf`, `.png→image/png`,
      `.jpg/.jpeg→image/jpeg`, else `application/octet-stream`.
- [x] 1.3 Unit tests for `blob.ts`: happy path, `..` traversal, absolute handle,
      symlink escape (create a symlink pointing outside root), missing file,
      missing/blank `cwd`/`handle`.

## 2. Route

- [x] 2.1 `src/server/routes.ts`: register `GET /api/plugins/invoicebot/blob`.
      Parse `cwd`+`handle` query params; call `resolveBlobPath`; map rejections to
      `400`/`403`/`404`.
- [x] 2.2 On success stream the file: set `Content-Type` (2.1.2), `Content-Disposition:
      inline; filename="<basename>"`, `Accept-Ranges: bytes`, `X-Content-Type-Options:
      nosniff`; `200` full body with `Content-Length`.
- [x] 2.3 Range support: parse `Range`; on satisfiable range respond `206` with
      `Content-Range` and a bounded stream; on unsatisfiable range `416`.

## 3. Route tests

- [x] 3.1 `__tests__/blob-route.test.ts`: serve a fixture PDF (`200`, correct
      content-type, inline, nosniff); image fixture; unknown-ext → octet-stream.
- [x] 3.2 Range test: `Range: bytes=0-99` → `206` + correct `Content-Range` + 100 bytes.
- [x] 3.3 Security tests through the route: `..` handle → `403`; absolute handle →
      `403`; symlink escape → `403`; absent file → `404`; missing params → `400`.

## 4. Docs + gap closure

- [x] 4.1 `api-contract.md`: document the GET blob route (params, status codes,
      headers, GET-vs-envelope rationale) and move **G3** out of the deferred table.
- [x] 4.2 `add-invoicebot-rest-plugin/tasks.md` §9.3: mark closed, referencing this change.
- [x] 4.3 Update `packages/invoicebot-plugin/src/server/AGENTS.md` route row for `blob.ts`/route.
- [x] 4.4 `npm test` green for the plugin package; `biome check` + `tsc --noEmit` clean.
