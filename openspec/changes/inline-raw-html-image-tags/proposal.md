# Inline raw HTML `<img>` tags in bridge asset inliner

## Why

The bridge asset inliner today rewrites only fully-closed `![alt](src)` markdown image tokens (regex `IMAGE_TOKEN_RE = /!\[([^\]\n]*)\]\(([^)\n\s]+)\)/g`). Raw HTML `<img>` tags written by the model — common when assistants emit "rich text" / "report" / "preview" prose — pass through the inliner untouched. The client's markdown renderer has `rehypeRaw` enabled, so those tags then materialize as real `<img>` elements whose `src` is the original local path (e.g. `/Users/x/foo.png`). The browser resolves the path against the dashboard origin, fetches `http://localhost:8000/Users/x/foo.png`, and 404s. Symptom: a broken-image icon next to alt text in the chat bubble.

This was confirmed end-to-end by a live render test in this repo on 2026-05-31. Variant 5 of the test (`<img src="/tmp/pi-img-test/teal.png" alt="raw-html-teal">`) rendered as `<img src="http://localhost:8000/tmp/pi-img-test/teal.png">` with `naturalWidth === 0`, while the equivalent `![teal](pi-asset:<hash>)` token resolved correctly via the existing pi-asset path. The gap is purely on the bridge side; the client's `PiAssetImg` `img` component override already handles every `<img>` element it sees (it just never gets a `pi-asset:` src to work with for raw HTML).

The fix is contained: extend the inliner's token scanner to also recognize `<img>` HTML tags, rewrite their `src` attribute in place to `pi-asset:<hash>`, and emit the same `asset_register` side-channel events. No protocol changes, no client changes, no server changes.

## What Changes

- **Inliner parses HTML `<img>` tags in addition to markdown `![alt](src)` tokens.** Both fully-closed forms (`<img src="..." />` and `<img src="...">`) are detected. Only the `src` attribute is rewritten — `alt`, `width`, `height`, `title`, `class`, `id`, and any other attributes are preserved verbatim in order and quoting.
- **Same rewrite contract as markdown tokens.** Local-path srcs are read, hashed, replaced with `pi-asset:<hash>`, and accompanied by a side-channel `asset_register` event. Already-resolved srcs (`data:`, `blob:`, `http:`, `https:`, `pi-asset:`, `#`) pass through. Idempotent on re-application.
- **Same enforcement surface.** MIME allowlist (PNG/JPEG/GIF/WebP/SVG/AVIF/BMP), per-image cap (5 MB), per-message cap (20 MB), and read-error placeholder behavior all apply identically. The placeholder text replaces the **entire `<img>` tag**, not just the `src` attribute, when a read fails or a cap is exceeded — matching the markdown-token behavior of replacing the whole `![alt](src)`.
- **Streaming-safe.** Partial tags (`<img src="/path/x` without a closing `>`) pass through unchanged so a later chunk completing the tag triggers the rewrite, mirroring how partial `![alt](src` tokens are handled today.
- **Per-session hash dedup is shared** between markdown-token and HTML-tag detection — the same `alreadyEmitted` set gates both. A file referenced first by `![]()` and later by `<img>` (or vice versa) emits exactly one `asset_register`.

## Capabilities

### Modified Capabilities
- `bridge-asset-inlining`: Add a new requirement covering HTML `<img>` tag detection and rewriting. Existing requirements (markdown-token detection, asset_register emission, MIME allowlist, size caps, idempotency) are unchanged — the new requirement layers a second token shape on top of the same downstream pipeline.

## Impact

- **Affected packages**: `packages/extension` (`src/markdown-image-inliner.ts` — extend `parseImageTokens` or introduce a sibling `parseHtmlImageTags` and merge results; `src/__tests__/markdown-image-inliner.test.ts` — add coverage).
- **No changes** to `packages/shared` (no protocol additions), `packages/server`, or `packages/client`. The existing `PiAssetImg` already handles `pi-asset:` srcs identically for `<img>` elements produced by `rehypeRaw` and those produced by `![]()` markdown.
- **No new npm dependencies.** A lightweight HTML-tag regex stays inside the existing pure inliner module; full HTML parsing is unnecessary and out of scope.
- **Backward compatibility**: a client running an older version still sees `pi-asset:<hash>` in the `src=` attribute; absent a resolver it renders as a broken-image link — identical to the pre-change behavior, so this change strictly improves coverage and never regresses.
- **Test impact**: only `markdown-image-inliner.test.ts` grows. No integration tests change because the wire-format contract for `asset_register` and the rewritten message text is unchanged.
