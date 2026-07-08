import { expect, type Page, test } from "@playwright/test";
import { sendPrompt, spawnFreshGitSession } from "./helpers/index.js";

// The scroll-to-bottom button ships with data-testid="scroll-to-bottom" but is
// not yet in the central TESTIDS map. Use it directly here; TODO: promote to
// TESTIDS (helpers/index.ts) when this spec is activated.
const scrollToBottomBtn = (page: Page) => page.getByTestId("scroll-to-bottom");

/**
 * SKELETON — browser-layer gate for change `virtualize-chat-transcript-tanstack`
 * (Phase 2 Step B) and its preserved `chat-scroll-lock` contract.
 *
 * These scenarios are the ONLY honest way to validate the parts that jsdom /
 * vitest cannot: real scroll heights, followOnAppend pinning, content-visibility
 * / windowing, and the multi-batch event_replay race. Each test below is tagged
 * with the spec requirement it gates.
 *
 * STATUS: skeleton. Tests needing a long transcript are `test.fixme` until the
 * fixture below exists. They document intent + assertions; they do not run red.
 *
 * BLOCKING FIXTURE (does not exist yet):
 *   qa/fixtures/faux-scenarios.ts needs a `long-transcript` scenario that
 *   streams N (~400+) heterogeneous messages so the transcript exceeds several
 *   viewports. `burst-heterogeneous` exists but is too short to force windowing
 *   or a >50px scroll-up. Add it, then flip the `fixme`s to `test`.
 *
 * OPEN DECISION (flag for implementation):
 *   The scroll CONTAINER has no data-testid (helpers note "do NOT add app
 *   testids for E2E"). But windowing needs a stable `getScrollElement`, and
 *   these tests need to read scrollTop/scrollHeight. Resolve one of:
 *     (a) add `data-testid="chat-scroll-container"` (justified — the virtualizer
 *         needs that node handle anyway), or
 *     (b) locate it structurally via `chatScroll()` below (brittle to markup).
 *   The skeleton uses (b) so it is self-contained; prefer (a) at implementation.
 */

const LONG = "[[faux:long-transcript]] go"; // TODO: add scenario (see header)

/** (b) Structural handle on the scroll container until a testid is decided. */
function chatScroll(page: Page) {
  // The transcript scroller is the overflow-y-auto column holding the message
  // list. Prefer a testid once (a) above is resolved.
  return page.locator(".overflow-y-auto").first();
}

async function metrics(page: Page) {
  return chatScroll(page).evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    // Windowing proof: rendered row count should be bounded by the viewport,
    // NOT the total message count, once TanStack Virtual lands.
    mountedRows: el.querySelectorAll("[data-turn]").length,
  }));
}

test.describe("chat transcript — scroll-lock + virtualization (Step B gate)", () => {
  // ── chat-scroll-lock: Requirement "Scroll lock when user scrolls up" ──────
  test.fixme(
    "50px lock: scrolling up during streaming stops auto-follow",
    async ({ page }) => {
      const card = await spawnFreshGitSession(page);
      await card.click();
      await sendPrompt(page, LONG);
      await chatScroll(page).waitFor({ state: "visible" });

      // Scroll up >50px while content is still streaming.
      await chatScroll(page).evaluate((el) => el.scrollBy(0, -400));
      const before = await metrics(page);
      expect(before.distanceFromBottom).toBeGreaterThan(50);

      // New streamed content must NOT pull the viewport down.
      await page.waitForTimeout(1_500);
      const after = await metrics(page);
      expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(4);
    },
  );

  // ── chat-scroll-lock: Requirement "Scroll-to-bottom button" ───────────────
  test.fixme("scroll-to-bottom button: appears when up, hides at bottom, click resumes", async ({ page }) => {
    const card = await spawnFreshGitSession(page);
    await card.click();
    await sendPrompt(page, LONG);
    await chatScroll(page).waitFor({ state: "visible" });

    const btn = scrollToBottomBtn(page);
    await chatScroll(page).evaluate((el) => el.scrollBy(0, -400));
    await expect(btn).toBeVisible();

    await btn.click();
    await expect(btn).toBeHidden();
    expect((await metrics(page)).distanceFromBottom).toBeLessThan(50);
  });

  // ── chat-scroll-lock: Requirement "Auto-scroll robust to multi-batch replay" ─
  test.fixme("reload lands at latest message after multi-batch event_replay", async ({ page }) => {
    const card = await spawnFreshGitSession(page);
    await card.click();
    await sendPrompt(page, LONG);
    await chatScroll(page).waitFor({ state: "visible" });

    // Reload: server replays the (uncached) transcript in batches. Final
    // position must be the bottom, button hidden — no mid-replay false lock.
    await page.reload();
    await chatScroll(page).waitFor({ state: "visible" });
    await page.waitForTimeout(3_000); // let all replay batches settle
    expect((await metrics(page)).distanceFromBottom).toBeLessThan(50);
    await expect(scrollToBottomBtn(page)).toBeHidden();
  });

  // ── chat-transcript-virtualization: "Jump to an off-screen turn" ──────────
  test.fixme("scrollToTurn reaches an unmounted (off-screen) turn", async ({ page }) => {
    // Exercises ChatViewHandle.scrollToTurn -> virtualizer.scrollToIndex.
    // The OLD querySelector path returns null for an unmounted turn (proven in
    // the unit spike); this asserts the map-based path scrolls it into view.
    // Needs a UI affordance that calls scrollToTurn (e.g. a jump control) or a
    // page.evaluate hook exposing the ChatViewHandle. TODO: pin the trigger.
    expect(true).toBe(true);
  });

  // ── chat-transcript-virtualization: "Streaming tail always rendered" ──────
  test.fixme("streaming tail stays mounted while scrolled up in history", async ({ page }) => {
    const card = await spawnFreshGitSession(page);
    await card.click();
    await sendPrompt(page, LONG);
    await chatScroll(page).waitFor({ state: "visible" });

    // Scroll far up, THEN assert the actively-streaming row is still in the DOM
    // (never virtualized away) even though it is below the viewport.
    await chatScroll(page).evaluate((el) => el.scrollTo(0, 0));
    // TODO: assert the streaming bubble (chat-stream-live) remains attached.
    expect(true).toBe(true);
  });

  // ── chat-transcript-virtualization: "Layout/node count bounded" ───────────
  test.fixme("mounted row count is bounded by the viewport, not session length", async ({ page }) => {
    const card = await spawnFreshGitSession(page);
    await card.click();
    await sendPrompt(page, LONG); // streams ~400+ messages
    await chatScroll(page).waitFor({ state: "visible" });
    await page.waitForTimeout(3_000);

    const { mountedRows } = await metrics(page);
    // With windowing, only viewport + overscan + streaming tail are mounted.
    // Pre-Step-B this equals total turns (~400); post-Step-B it is bounded.
    expect(mountedRows).toBeLessThan(60);
  });
});
