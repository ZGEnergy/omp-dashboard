# replay-persist.ts — index

Debounced replay-cache writer. createReplayPersister(cache,debounceMs). Owns per-session raw-event buffer (monotonic by seq, dedup append). record/seed/drop/flush. drop clears buffer + deletes cache entry. See change: reduce-session-replay-traffic.

`bytes(sessionId)` getter returns retained UTF-8 buffer bytes (O(1), reads tracked `ReplayBuffer.bytes`); 0 for unknown session and after `dispose()`. Feeds `HotWindowReport.persisterBytes`. See change: hot-window-metrics.
