## MODIFIED Requirements

### Requirement: ReadToolRenderer
The Read renderer SHALL display the file path as a header with an "Open in editor" button. When the tool result includes image attachments (via the `images` field on the ChatMessage), the renderer SHALL display each image as an inline `<img>` element with a max width of 512px, rounded corners, and a subtle border. The image SHALL be rendered from base64 data using a `data:` URI. When no images are present, the tool result (file content) SHALL be displayed in a syntax-highlighted code block with language auto-detection based on file extension. The syntax highlighting style SHALL be resolved using the active theme name.

#### Scenario: Read image file displays inline image
- **WHEN** a read tool call completes with an image attachment
- **THEN** the renderer SHALL show the file path and an inline `<img>` element

#### Scenario: Read image file with text fallback
- **WHEN** a read tool call completes with both an image attachment and a text result
- **THEN** the renderer SHALL show the inline image and NOT show the text result as a code block

#### Scenario: Read text file displayed as code
- **WHEN** a read tool call completes with text content and no image attachments
- **THEN** the renderer SHALL show the file path and syntax-highlighted content

#### Scenario: Read file respects named theme
- **WHEN** a read tool call renders under the Dracula theme
- **THEN** the syntax token colors SHALL use the Dracula syntax style, not the base default

### Requirement: ToolCallStep auto-expands for image results
The `ToolCallStep` component SHALL default to expanded when the tool result contains image attachments. For tool results without images, the default SHALL remain collapsed.

#### Scenario: Image tool result is expanded by default
- **WHEN** a tool call step renders with image attachments
- **THEN** the step SHALL be expanded (content visible) without user interaction

#### Scenario: Non-image tool result is collapsed by default
- **WHEN** a tool call step renders without image attachments
- **THEN** the step SHALL be collapsed by default
