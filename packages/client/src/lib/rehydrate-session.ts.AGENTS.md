# rehydrate-session.ts — index

`rehydrateSession(sessionId,cache)` validates exact events plus skipped ranges, re-reduces exact events into provisional state, and returns logical min/max coverage. Any malformed coverage or reducer fault discards cache and returns miss. See changes: reduce-session-replay-traffic, fix-reducer-crash-undefined-toolname, tool-burst-hydration.
