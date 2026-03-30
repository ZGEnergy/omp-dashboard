## ADDED Requirements

### Requirement: Scroll lock when user scrolls up
The chat view SHALL pause auto-scrolling when the user scrolls away from the bottom of the message list. Auto-scroll SHALL resume only when the user scrolls back to within 50px of the bottom.

#### Scenario: User scrolls up during streaming
- **WHEN** the user scrolls up so that the scroll position is more than 50px from the bottom
- **THEN** new messages and streaming content SHALL NOT cause the view to scroll

#### Scenario: User scrolls back to bottom
- **WHEN** the user scrolls to within 50px of the bottom
- **THEN** auto-scroll SHALL resume and the view SHALL follow new content

### Requirement: Scroll-to-bottom button
The chat view SHALL display a floating button when the user is scroll-locked (not near the bottom). The button SHALL be centered horizontally at the bottom of the chat area.

#### Scenario: Button appears when scrolled up
- **WHEN** the scroll position is more than 50px from the bottom
- **THEN** a scroll-to-bottom button SHALL be visible

#### Scenario: Button hidden when at bottom
- **WHEN** the scroll position is within 50px of the bottom
- **THEN** the scroll-to-bottom button SHALL NOT be visible

#### Scenario: Clicking button scrolls to bottom and resumes follow
- **WHEN** the user clicks the scroll-to-bottom button
- **THEN** the view SHALL smooth-scroll to the bottom AND auto-scroll SHALL resume
