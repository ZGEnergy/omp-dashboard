# SUPERSEDED — 2026-05-28

This change consolidated with `bridge-owned-followup-queue` into a single change: **`rework-mid-turn-prompt-queue`**.

Reason: the two changes were tightly coupled. Deletion of broken Phase 3 mutation surface (this change) only made sense alongside re-introduction of working bridge-owned mutation (the other change). Shipping them as one logical work-unit avoids a window where the dashboard's QueuePanel is read-only with no replacement mutation path.

The "honest cleanup" sections of this change (43/47 tasks done in working copy) are folded into the consolidated change's §1 "Cleanup already in working copy" section, marked `[x]`.

Pi 0.76.0 ExtensionAPI re-verified during consolidation:
- `sendUserMessage`, `abort`, `hasPendingMessages` → exposed ✓
- `clearSteeringQueue`, `clearFollowUpQueue`, `clearAllQueues` → NOT exposed ✗ (still only on inner Agent class)

Original artifacts (proposal.md, design.md, tasks.md, specs/) preserved unchanged below for history.
