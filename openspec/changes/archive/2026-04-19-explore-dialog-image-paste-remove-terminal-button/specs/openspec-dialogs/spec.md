## MODIFIED Requirements

### Requirement: Explore dialog
Clicking [Explore] on a change SHALL open a modal dialog with a multiline text input and support for pasted image attachments. The dialog SHALL render via DialogPortal at document.body with z-[60]. The dialog container SHALL use `max-w-2xl` (wider than a standard small modal) and the textarea SHALL be at least `h-48` to accommodate longer exploration prompts. The dialog textarea SHALL accept clipboard-pasted images via the shared `useImagePaste()` hook, and pasted images SHALL be rendered below the textarea via the shared `<ImagePreviewStrip>` component. The placeholder SHALL hint at the paste capability (e.g., "What do you want to explore?  (paste images with Cmd/Ctrl+V)").

#### Scenario: Open explore dialog
- **WHEN** user clicks [Explore] on change "theme-system"
- **THEN** a dialog appears with title "Explore: theme-system", a multiline text input at least `h-48` tall, and a container sized `max-w-2xl`
- **AND** the dialog is rendered at document.body via DialogPortal

#### Scenario: Send explore command without images
- **WHEN** user types text and clicks [Explore] in the explore dialog
- **THEN** a `send_prompt` is sent with text `/skill:openspec-explore theme-system\n<user text>` and no images
- **AND** the dialog closes

#### Scenario: Paste image into explore dialog
- **WHEN** the user pastes an image into the Explore dialog's textarea
- **THEN** the image SHALL appear as a thumbnail below the textarea with a remove (×) button
- **AND** the dialog SHALL NOT close

#### Scenario: Send explore command with images
- **WHEN** user types text, pastes one or more images, and clicks [Explore]
- **THEN** a `send_prompt` is sent with text `/skill:openspec-explore theme-system\n<user text>` AND `images: ImageContent[]` containing the pasted images
- **AND** the dialog closes
- **AND** the pending images list is cleared

#### Scenario: Remove pasted image before sending
- **WHEN** user has pasted an image and clicks the remove (×) button on its thumbnail
- **THEN** the image SHALL be removed from the pending images list
- **AND** the dialog SHALL remain open

#### Scenario: Cancel explore dialog
- **WHEN** user clicks [Cancel] in the explore dialog
- **THEN** the dialog closes without sending anything
- **AND** any pasted images are discarded
