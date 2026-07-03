# inline-artifact-image-paths — delta

## MODIFIED Requirements

### Requirement: the bridge SHALL inline path-referenced image results at capture time

At `tool_execution_end`, the bridge SHALL detect tool-result text that references an existing local image file by absolute path (recognized image extension) and SHALL attach the image as a `type:"image"` content block on the forwarded result, reusing the existing image-inlining helpers and byte caps. An inlined path SHALL NOT also be emitted as a text path-link for the same image. A referenced path that does not exist, is not a recognized image extension, exceeds `MAX_PER_IMAGE_BYTES`, or would push the result past `MAX_PER_MESSAGE_BYTES` SHALL be left as text (so it falls back to the artifact-serving route).

The bridge SHALL NOT append an image block that is **byte-identical** to an image block **already present** in the result. When a referenced path resolves to bytes matching an existing image block (e.g. the MCP `browser` tool returns both the `Screenshot saved: <path>` text AND a native image block for that same screenshot), the bridge SHALL treat the image as already displayed: it SHALL strip the redundant path from the text but SHALL NOT append a duplicate. When the inliner rewrites the result solely to strip such a redundant path (no new image inlined), the bridge SHALL still apply the rewritten result.

#### Scenario: screenshot path is inlined as an image block

- **GIVEN** a tool result whose text contains `Screenshot saved: <abs>/shot.png` and `shot.png` exists and is under `MAX_PER_IMAGE_BYTES`
- **WHEN** the bridge extracts the result at `tool_execution_end`
- **THEN** the forwarded result SHALL carry a `type:"image"` content block for `shot.png`
- **AND** no path-link SHALL be emitted for that image

#### Scenario: result already carries the image natively is not duplicated

- **GIVEN** a tool result whose content already includes a `type:"image"` block AND a text block referencing the same file by absolute path, where the file's bytes are identical to the existing image block
- **WHEN** the bridge extracts the result at `tool_execution_end`
- **THEN** the forwarded result SHALL contain exactly one image block for that screenshot (no side-by-side duplicate)
- **AND** the redundant path SHALL be stripped from the text
- **AND** the bridge SHALL apply the stripped result even though no new image was inlined

#### Scenario: native image plus a path to a different file keeps both

- **GIVEN** a tool result with a native `type:"image"` block AND a text path to a *different* existing image file (distinct bytes)
- **WHEN** the bridge extracts the result at `tool_execution_end`
- **THEN** the forwarded result SHALL contain both image blocks

#### Scenario: over-cap image is left as a link

- **GIVEN** a referenced image file larger than `MAX_PER_IMAGE_BYTES`
- **WHEN** the bridge extracts the result
- **THEN** the path SHALL remain as text (no image block)
- **AND** it SHALL be served by the artifact-serving fallback route instead

#### Scenario: non-existent or non-image path is untouched

- **WHEN** a tool result references an absolute path that does not exist, or whose extension is not a recognized image type
- **THEN** the bridge SHALL NOT attach an image block and SHALL leave the text unchanged
