# Dashboard Recipes

Step-by-step browser debugging recipes for the pi-agent-dashboard. Each recipe includes the command sequence and related component files.

## Detect Dashboard First

```bash
bash "$SKILL_DIR/scripts/detect-dashboard.sh"
```

Use the `DASHBOARD_URL` from the output in all recipes below.

**Remember:** Always `browser close` when done with a recipe.

---

## Recipe: Verify Session Card Rendering

**When**: You changed session card styling, status badges, or card layout.

```
browser open http://localhost:8000
browser wait --load networkidle
browser screenshot
browser snapshot -i
```

Look at the sidebar — are session cards visible, properly spaced, showing status?

**Related components:**
- `src/client/components/SessionCard.tsx`
- `src/client/components/SessionList.tsx`
- `src/client/components/SessionSidebar.tsx`
- `src/client/components/SortableSessionCard.tsx`
- `src/client/components/PlaceholderSessionCard.tsx`

```
browser close
```

---

## Recipe: Check Chat View Scrolling

**When**: You changed chat rendering, message layout, or scroll behavior.

```
browser open http://localhost:8000
browser wait --load networkidle
browser snapshot -i
```

Click a session card to open its chat:

```
browser click @eN
browser wait --load networkidle
browser screenshot
```

Scroll to check older messages:

```
browser scroll down 500
browser screenshot
browser scroll up 500
browser screenshot
```

**Related components:**
- `src/client/components/ChatView.tsx`
- `src/client/components/MarkdownContent.tsx`
- `src/client/components/ThinkingBlock.tsx`
- `src/client/components/ToolCallStep.tsx`
- `src/client/components/BashOutputCard.tsx`

```
browser close
```

---

## Recipe: Verify Flow Dashboard Cards

**When**: You changed flow card rendering, agent status, or the flow grid layout.

```
browser open http://localhost:8000
browser wait --load networkidle
browser snapshot -i
```

Select a session running a flow, then screenshot:

```
browser click @eN
browser wait --load networkidle
browser screenshot
```

Look for the sticky flow card grid above the chat.

**Related components:**
- `src/client/components/FlowDashboard.tsx`
- `src/client/components/FlowAgentCard.tsx`
- `src/client/components/FlowAgentDetail.tsx`
- `src/client/components/FlowSummary.tsx`
- `src/client/components/FlowActivityBadge.tsx`

```
browser close
```

---

## Recipe: Check Settings Panel

**When**: You changed settings layout, form fields, or the settings tabbed UI.

```
browser open http://localhost:8000
browser wait --load networkidle
browser snapshot -i
```

Find and click the settings gear/button:

```
browser click @eN
browser wait --load networkidle
browser screenshot
```

Scroll through settings sections:

```
browser scroll down 300
browser screenshot
```

**Related components:**
- `src/client/components/SettingsPanel.tsx`
- `src/client/components/ProviderAuthSection.tsx`
- `src/client/components/ThemePicker.tsx`
- `src/client/components/TunnelButton.tsx`

```
browser close
```

---

## Recipe: Test Mobile Shell

**When**: You changed mobile layout, slide transitions, or swipe-back behavior.

Switch to mobile viewport first:

```
browser open http://localhost:8000
browser set viewport 375 667
browser wait --load networkidle
browser screenshot
```

Navigate into a session:

```
browser snapshot -i
browser click @eN
browser screenshot
```

Check the hamburger menu:

```
browser snapshot -i
browser click @eN
browser screenshot
```

**Related components:**
- `src/client/components/MobileShell.tsx`
- `src/client/components/MobileActionMenu.tsx`
- `src/client/components/MobileOverlay.tsx`
- `src/client/hooks/useSwipeBack.ts`

```
browser close
```

---

## Recipe: Validate Terminal View

**When**: You changed terminal rendering or terminal card styling.

```
browser open http://localhost:8000
browser wait --load networkidle
browser snapshot -i
```

Find a terminal card in the sidebar and click it:

```
browser click @eN
browser wait --load networkidle
browser screenshot
```

**Related components:**
- `src/client/components/TerminalView.tsx`
- `src/client/components/TerminalCard.tsx`

```
browser close
```

---

## Recipe: Check File Diff View

**When**: You changed the diff viewer, file tree, or diff rendering.

```
browser open http://localhost:8000
browser wait --load networkidle
browser snapshot -i
```

Navigate to a session's diff view (via session header action):

```
browser click @eN
browser wait --load networkidle
browser screenshot
```

Click files in the tree to check diff rendering:

```
browser snapshot -i
browser click @eN
browser screenshot
```

**Related components:**
- `src/client/components/FileDiffView.tsx`
- `src/client/components/DiffFileTree.tsx`
- `src/client/components/DiffPanel.tsx`

```
browser close
```
