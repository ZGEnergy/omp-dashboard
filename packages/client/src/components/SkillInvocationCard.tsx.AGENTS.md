# SkillInvocationCard.tsx — index

Collapsible card rendering a `<skill>` user invocation. Purple-tinted, wrench icon, default-collapsed body via `MarkdownContent`. Footer: copy-as-markdown/plain-text/command, fork-from-message. Props: `skill` (`SkillBlock`), `rawContent`, `timestamp`, `entryId`, `onFork`. Exports `SkillInvocationCard`. Per-message fork button extracted to `ForkFromHereButton.tsx` (shared with `ChatView`). See change: fork-action-opens-an-empty-chat.
