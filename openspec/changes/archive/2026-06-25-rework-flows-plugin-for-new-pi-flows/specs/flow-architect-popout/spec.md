## REMOVED Requirements

### Requirement: Flows plugin claims the architect popout route via `shell-overlay-route`
**Reason**: Upstream pi-flows removed the flow-architect; the architect popout has no content to display. The manifest claim, its route, and the `FlowArchitectPopoutClaim` component are deleted.
**Migration**: None — no architect popout exists. Flow authoring happens inline in the main-session timeline.

### Requirement: FlowArchitectPopoutClaim self-derives
**Reason**: `FlowArchitectPopoutClaim` is deleted along with the architect popout route.
**Migration**: None.

### Requirement: FlowArchitectPopoutPage renders the architect in fullscreen
**Reason**: `FlowArchitectPopoutPage` and `FlowArchitectDetail` are deleted; there is no architect state to render.
**Migration**: None.

### Requirement: Popout page handles four empty-state branches
**Reason**: The popout page is deleted.
**Migration**: None.
