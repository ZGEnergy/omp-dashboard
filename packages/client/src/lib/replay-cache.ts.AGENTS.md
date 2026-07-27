# replay-cache.ts — index

Durable per-session IndexedDB replay cache. Stores exact events plus `skippedSeqRanges` under schema v4. Computes logical min/max across both forms. `put` applies byte cap and strict LRU eviction. Miss/error/schema mismatch triggers full replay. See changes: reduce-session-replay-traffic, tool-burst-hydration.
