## Why

When new messages arrive in the chat view, it always auto-scrolls to the bottom. If the user is reading earlier messages (scrolled up), they lose their place every time new content streams in. This makes it impossible to review history while the agent is actively working.

## What Changes

- Detect when the user has scrolled away from the bottom and **pause auto-scroll** (scroll lock).
- Resume auto-scroll when the user scrolls back to the bottom (within a small threshold).
- Show a floating **"scroll to bottom" button** when scroll-locked, so the user can jump to the latest content and resume following in one click.

## Capabilities

### New Capabilities
- `chat-scroll-lock`: Scroll-lock detection, conditional auto-scroll, and scroll-to-bottom FAB button in the chat view.

### Modified Capabilities
- `chat-view`: The auto-scroll requirement changes — scrolling to bottom is now conditional on user scroll position rather than unconditional.

## Impact

- `src/client/components/ChatView.tsx` — add scroll listener, conditional auto-scroll logic, and floating button.
- `src/client/components/__tests__/ChatView.test.tsx` — new tests for scroll-lock behavior and button visibility.
- No server, protocol, or shared type changes.
