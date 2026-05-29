# SUPERSEDED — 2026-05-28

This change consolidated with `honest-mid-turn-queue-surface` into a single change: **`rework-mid-turn-prompt-queue`**.

Reason: the two changes were tightly coupled. Re-introduction of bridge-owned mutation (this change) only made sense alongside deletion of the broken Phase 3 mutation surface (the other change). Shipping them as one logical work-unit avoids a window where the dashboard's QueuePanel is read-only with no replacement mutation path.

This change had 0/49 tasks done — pure proposal. All TODO tasks are folded into the consolidated change's §2 "Bridge-owned restoration" section, marked `[ ]`.

Hard design constraint added during consolidation (user direction): **steer will NEVER live on the bridge.** Reason: steer drains every 1-15 seconds at `turn_end` boundaries. Mutation UI on a queue that drains faster than humans can react is wasted code. Steer stays pi-owned + display-only as inline ghost bubbles in `ChatView`. This is now a permanent decision, not a tracked future change.

Original artifacts (proposal.md, design.md, tasks.md, specs/) preserved unchanged below for history.
