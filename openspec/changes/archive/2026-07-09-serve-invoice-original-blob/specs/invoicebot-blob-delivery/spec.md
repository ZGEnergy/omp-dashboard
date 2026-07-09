## ADDED Requirements

### Requirement: Blob byte delivery route
The invoicebot-plugin SHALL expose `GET /api/plugins/invoicebot/blob` that streams
the bytes of a retained original document identified by a `handle`, scoped to a
workspace `cwd`, so a browser can render it natively.

#### Scenario: PDF served inline
- **WHEN** a GET request supplies a valid `cwd` and a `handle` resolving to an
  existing `.pdf` under `<cwd>/.pi/flows/invoicebot-state/blobs/`
- **THEN** the response is `200` with `Content-Type: application/pdf`,
  `Content-Disposition: inline`, `Accept-Ranges: bytes`, and the file bytes

#### Scenario: image served inline
- **WHEN** the resolved handle ends in `.png`, `.jpg`, or `.jpeg`
- **THEN** the `Content-Type` is `image/png` or `image/jpeg` accordingly, served inline

#### Scenario: unknown type falls back to octet-stream
- **WHEN** the resolved handle has an extension outside the previewable set
- **THEN** the `Content-Type` is `application/octet-stream` (the client offers a download)

### Requirement: Range request support
The route SHALL honor HTTP `Range` requests so a browser PDF viewer can page-in
large documents lazily.

#### Scenario: partial content
- **WHEN** a request includes a satisfiable `Range` header
- **THEN** the response is `206 Partial Content` with a `Content-Range` header and
  only the requested byte range

#### Scenario: full content
- **WHEN** no `Range` header is present
- **THEN** the response is `200` with `Content-Length` and the full body

### Requirement: Path-traversal containment
The route SHALL resolve the target real path and serve it only if it stays inside
the request workspace's `blobs/` directory.

#### Scenario: traversal handle rejected
- **WHEN** `handle` contains `..` segments, is an absolute path, or resolves
  (following symlinks) outside `<cwd>/.pi/flows/invoicebot-state/blobs/`
- **THEN** the response is `403` and no bytes are served

#### Scenario: missing or invalid inputs
- **WHEN** `cwd` or `handle` is absent, or `cwd` is not a valid workspace directory
- **THEN** the response is `400`

#### Scenario: file absent
- **WHEN** inputs are valid and contained but the file does not exist
- **THEN** the response is `404`

### Requirement: No MIME re-interpretation
The route SHALL set `X-Content-Type-Options: nosniff` so the browser does not
re-interpret served bytes as HTML or script.

#### Scenario: nosniff header present
- **WHEN** any successful blob response is returned
- **THEN** it carries `X-Content-Type-Options: nosniff`
