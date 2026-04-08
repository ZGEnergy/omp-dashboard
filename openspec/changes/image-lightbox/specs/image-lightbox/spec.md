## ADDED Requirements

### Requirement: Click image to open lightbox
All images in the chat UI (user message attachments, tool result images, paste preview thumbnails) SHALL open a full-size lightbox dialog when clicked. The image thumbnail SHALL display `cursor-pointer` to indicate interactivity.

#### Scenario: Click user message image
- **WHEN** user clicks an image in a user message bubble
- **THEN** a lightbox dialog opens showing the image at full size over a dark overlay

#### Scenario: Click tool result image
- **WHEN** user clicks an image in an expanded tool result (e.g., ReadToolRenderer)
- **THEN** a lightbox dialog opens showing the image at full size over a dark overlay

#### Scenario: Click paste preview image
- **WHEN** user clicks an image thumbnail in the CommandInput paste preview area
- **THEN** a lightbox dialog opens showing the image at full size over a dark overlay

### Requirement: Close lightbox with Escape key
The lightbox dialog SHALL close when the user presses the Escape key.

#### Scenario: Press Escape to close
- **WHEN** the lightbox is open and user presses Escape
- **THEN** the lightbox closes and the chat view is visible again

### Requirement: Close lightbox with backdrop click
The lightbox dialog SHALL close when the user clicks the dark overlay area outside the image.

#### Scenario: Click backdrop to close
- **WHEN** the lightbox is open and user clicks the dark area outside the image
- **THEN** the lightbox closes

#### Scenario: Click image does not close
- **WHEN** the lightbox is open and user clicks on the image itself
- **THEN** the lightbox SHALL NOT close (click initiates drag/pan)

### Requirement: Zoom and pan in lightbox
The lightbox SHALL support zoom via mouse wheel and pinch gesture, and pan via click-and-drag. Double-click SHALL reset zoom/pan to default.

#### Scenario: Wheel zoom
- **WHEN** user scrolls the mouse wheel over the lightbox image
- **THEN** the image zooms in or out centered on the cursor position

#### Scenario: Drag to pan
- **WHEN** user clicks and drags on the image
- **THEN** the image pans following the pointer movement

#### Scenario: Pinch to zoom on touch
- **WHEN** user performs a two-finger pinch gesture on the image
- **THEN** the image zooms in or out centered between the touch points

#### Scenario: Double-click to reset
- **WHEN** user double-clicks the image in the lightbox
- **THEN** zoom and pan reset to the default (scale 1, centered)
