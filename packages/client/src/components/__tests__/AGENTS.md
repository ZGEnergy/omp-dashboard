# DOX — packages/client/src/components/__tests__

Files in this directory. One row per source file.

| File | Purpose |
|------|---------|
| `ChatView.fork-pending.test.tsx` | Per-message fork pending feedback + dedup, driving the real `ForkPendingProvider`/`useForkPendingController`. Covers: spinner + `disabled` synchronously on click; two rapid clicks send once; settle by requestId re-enables; unrelated requestId does not; 30 s safety timeout settles. See change: fork-action-opens-an-empty-chat. |
| `virtual-core-teardown.test.ts` | Regression for late element/window offset debounce callbacks after virtualizer cleanup. |
