# Bridge Asset Inlining — Delta

## ADDED Requirements

### Requirement: Bridge inlines local-path image references in raw HTML `<img>` tags
The bridge SHALL, in addition to scanning for fully-closed `![alt](src)` markdown image tokens, scan assistant message text for fully-closed HTML `<img>` tags whose `src` attribute is double- or single-quoted. For each detected tag whose `src` value resolves to a local file path, the bridge SHALL replace the `src` attribute value in place with `pi-asset:<hash>` where `<hash>` is the truncated-SHA-256 content hash of the file. The detection SHALL be case-insensitive on the tag name (`<img>`, `<IMG>`, `<Img>`). All other attributes of the tag (e.g. `alt`, `width`, `height`, `title`, `class`, `id`, boolean attributes) SHALL be preserved verbatim, including their order, whitespace, and quote style. The original `src` attribute's quote style (double or single) SHALL be preserved. Tags whose `src` already begins with `data:`, `blob:`, `http:`, `https:`, `pi-asset:`, or `#` SHALL pass through unchanged. Partially-formed tags (e.g. `<img src="/path/x` without a closing `>`) SHALL pass through unchanged. Tags whose `src` is unquoted SHALL pass through unchanged. Tags whose `src` value spans a newline SHALL pass through unchanged. The HTML-tag rewrite SHALL share the same per-session `alreadyEmitted` hash set and the same per-message cumulative byte budget as the existing markdown-token rewrite, so a file referenced by either token shape (in any order) emits exactly one `asset_register` per session and contributes its bytes exactly once to the per-message cap. The transformation SHALL be deterministic and idempotent — applying it twice to the same text SHALL yield the same result as applying it once.

#### Scenario: Local absolute path in HTML img tag
- **WHEN** the bridge receives an assistant `message_end` whose text contains `<img src="/home/me/shot.png" alt="pic" width="64">` and `/home/me/shot.png` exists with a recognized image extension and ≤5 MB
- **THEN** the forwarded `message_end` text SHALL contain `<img src="pi-asset:<hash>" alt="pic" width="64">` (other attributes preserved verbatim) and the bridge SHALL have emitted a preceding `asset_register` event carrying the file's bytes

#### Scenario: Single-quoted src preserved
- **WHEN** the bridge receives a message whose text contains `<img src='/home/me/shot.png' alt='pic'>`
- **THEN** the forwarded text SHALL contain `<img src='pi-asset:<hash>' alt='pic'>` with single quotes preserved on the rewritten `src`

#### Scenario: Self-closing img tag preserved
- **WHEN** the bridge receives a message whose text contains `<img src="/home/me/shot.png" />`
- **THEN** the forwarded text SHALL contain `<img src="pi-asset:<hash>" />` and the self-closing `/>` SHALL be preserved

#### Scenario: External URL HTML img unchanged
- **WHEN** the bridge receives a message whose text contains `<img src="https://example.com/logo.png">`
- **THEN** the forwarded text SHALL still contain the original `<img src="https://example.com/logo.png">` and no `asset_register` SHALL be emitted

#### Scenario: pi-asset HTML img idempotent
- **WHEN** the inliner is applied to text that already contains `<img src="pi-asset:abc1234567890">`
- **THEN** the output SHALL be byte-identical to the input and no `asset_register` SHALL be emitted

#### Scenario: Partial HTML img tag passes through
- **WHEN** a `message_update` text ends with `<img src="/home/me/shot.p` (no closing `>`)
- **THEN** that partial tag SHALL pass through unchanged and no `asset_register` SHALL be emitted

#### Scenario: Unquoted src not rewritten
- **WHEN** the bridge receives a message whose text contains `<img src=/home/me/shot.png>` (unquoted)
- **THEN** the forwarded text SHALL be unchanged for that tag and no `asset_register` SHALL be emitted

#### Scenario: Case-insensitive tag name matching
- **WHEN** the bridge receives a message whose text contains `<IMG src="/home/me/shot.png">`
- **THEN** the forwarded text SHALL contain `<IMG src="pi-asset:<hash>">` (tag-name case preserved, src rewritten)

#### Scenario: Read failure replaces entire HTML img tag with placeholder text
- **WHEN** the bridge receives a message whose text contains `<img src="/no/such/file.png" alt="missing">` and the file does not exist
- **THEN** the forwarded text SHALL contain the literal string `[image not found: /no/such/file.png]` in place of the entire `<img>` tag and no `asset_register` SHALL be emitted

#### Scenario: Oversized file in HTML img replaces entire tag
- **WHEN** the bridge receives a message whose text contains `<img src="/home/me/big.png">` and `big.png` is 6 000 000 bytes
- **THEN** the forwarded text SHALL contain `[image too large: /home/me/big.png (5.7 MB)]` in place of the entire `<img>` tag and no `asset_register` SHALL be emitted

#### Scenario: Per-message budget exhausted by HTML img tags
- **WHEN** an assistant message contains five HTML `<img>` tags each referencing a distinct unregistered local 5 MB image
- **THEN** the bridge SHALL emit `asset_register` for the first four (cumulative ≤ 20 MB) and SHALL replace the fifth `<img>` tag with `[message asset budget exhausted: <src>]`; the first four tags SHALL be rewritten to `<img src="pi-asset:<hash>">`

#### Scenario: Shared dedup across markdown tokens and HTML tags
- **WHEN** an assistant message contains both `![pic](/home/me/shot.png)` and `<img src="/home/me/shot.png">` referencing the same file with a hash not yet seen in the session
- **THEN** the bridge SHALL emit exactly one `asset_register` event for that hash; the forwarded text SHALL contain both `![pic](pi-asset:<hash>)` and `<img src="pi-asset:<hash>">` with the same `<hash>` in both positions

#### Scenario: Dedup across messages with mixed token shapes
- **WHEN** a session has previously emitted an `asset_register` for hash `H` (via either token shape) and a later assistant message contains `<img src="/path/whose-bytes-hash-to-H.png">`
- **THEN** the bridge SHALL emit zero additional `asset_register` events and the forwarded text SHALL contain `<img src="pi-asset:H">`

#### Scenario: User message HTML img tags not inlined
- **WHEN** a `message_update` is for a user message (not assistant) whose text contains `<img src="/home/me/shot.png">`
- **THEN** the inliner SHALL NOT scan or rewrite the tag, matching the existing user-message exclusion for markdown tokens
