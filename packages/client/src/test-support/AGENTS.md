# DOX — packages/client/src/test-support

Files in this directory. One row per source file.

| File | Purpose |
|------|---------|
| `virtualizer-jsdom.ts` | Vitest `setupFiles` shim (wired in `packages/client/vitest.config.ts`). jsdom has no layout/`ResizeObserver`, so TanStack Virtual reads `offsetHeight`=0 and renders ZERO rows. Provides a no-op `ResizeObserver` + reports a tall `offsetHeight`/`offsetWidth` for ONLY the ChatView scroll container (`data-testid="chat-scroll-container"`), so ALL windowed rows mount for per-row content assertions (rows still measure 0). Scroll/windowing BEHAVIOUR is Playwright-gated, not asserted here. See change: virtualize-chat-transcript-tanstack. |
