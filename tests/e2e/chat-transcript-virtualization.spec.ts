import { expect, type Page, test } from "@playwright/test";
import { byTestId, sendPrompt, spawnFreshGitSession } from "./helpers/index.js";

/**
 * Browser-layer gate for change `virtualize-chat-transcript-tanstack` (Phase 2
 * Step B) and its preserved `chat-scroll-lock` contract.
 *
 * These scenarios are the ONLY honest way to validate the parts jsdom / vitest
 * cannot: real scroll heights, follow-while-pinned, windowing (unmounted rows),
 * the multi-batch event_replay race, and off-screen scrollToTurn. Each test is
 * tagged with the spec requirement it gates.
 *
 * FIXTURE: `qa/fixtures/faux-scenarios.ts` → `long-transcript` streams ~120
 * heterogeneous turns (thinking + text + a distinct bash call) so the transcript
 * spans several viewports. The tail is `LONG_TRANSCRIPT_TAIL` (mirrored below).
 *
 * SCROLL HANDLE: the transcript scroller carries data-testid="chat-scroll-container"
 * (TESTIDS.chatScrollContainer) — the windowed list needs a stable getScrollElement
 * node anyway, so reading scrollTop/scrollHeight off it is justified.
 *
 * WINDOWING PROOF: mounted rows are counted via `[data-index]` (the absolutely
 * positioned virtual-row wrappers), NOT `[data-turn]` (only on user rows). With
 * windowing this is bounded by viewport + overscan, far below the total.
 */

// Sentinel resolved by the faux provider to the `long-transcript` scenario.
const LONG = "[[faux:long-transcript]] go";
// Keep in sync with LONG_TRANSCRIPT_TAIL in qa/fixtures/faux-scenarios.ts
// (duplicated so this spec does not import the pi-ai-laden fixture module).
const LONG_TRANSCRIPT_TAIL = "long-transcript complete";

const chatScroll = (page: Page) => byTestId(page, "chatScrollContainer");
const scrollToBottomBtn = (page: Page) => byTestId(page, "scrollToBottom");

async function metrics(page: Page) {
  return chatScroll(page).evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    // Windowing proof: mounted virtual-row wrappers, bounded by the viewport.
    mountedRows: el.querySelectorAll("[data-index]").length,
  }));
}

/** Send LONG and wait until enough content has streamed to allow a >50px scroll-up. */
async function startLongStream(page: Page): Promise<void> {
  const card = await spawnFreshGitSession(page);
  await card.click();
  await sendPrompt(page, LONG);
  await chatScroll(page).waitFor({ state: "visible" });
  await expect
    .poll(async () => (await metrics(page)).scrollHeight - (await metrics(page)).clientHeight, {
      timeout: 60_000,
    })
    .toBeGreaterThan(600);
}

/** Wait until the whole long transcript has streamed (tail message committed). */
async function waitForTail(page: Page): Promise<void> {
  await expect(page.getByText(LONG_TRANSCRIPT_TAIL).last()).toBeVisible({ timeout: 180_000 });
}

test.describe("chat transcript — scroll-lock + virtualization (Step B gate)", () => {
  // ── chat-scroll-lock: "Scroll lock when user scrolls up" ──────────────────
  test("50px lock: scrolling up during streaming stops auto-follow", async ({ page }) => {
    await startLongStream(page);

    // Scroll up >50px while content is still streaming.
    await chatScroll(page).evaluate((el) => el.scrollBy(0, -400));
    const before = await metrics(page);
    expect(before.distanceFromBottom).toBeGreaterThan(50);

    // New streamed content must NOT pull the viewport down.
    await page.waitForTimeout(1_500);
    const after = await metrics(page);
    expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(4);
  });

  // ── chat-scroll-lock: "Scroll-to-bottom button" ───────────────────────────
  test("scroll-to-bottom button: appears when up, hides at bottom, click resumes", async ({ page }) => {
    await startLongStream(page);

    const btn = scrollToBottomBtn(page);
    await chatScroll(page).evaluate((el) => el.scrollBy(0, -400));
    await expect(btn).toBeVisible();

    await btn.click();
    await expect(btn).toBeHidden();
    expect((await metrics(page)).distanceFromBottom).toBeLessThan(50);
  });

  // ── chat-scroll-lock: "Auto-scroll robust to multi-batch replay" ──────────
  test("reload lands at latest message after multi-batch event_replay", async ({ page }) => {
    await startLongStream(page);
    await waitForTail(page); // full transcript persisted before reload

    // Reload: server replays the (uncached) transcript in batches. Final
    // position must be the bottom, button hidden — no mid-replay false lock.
    await page.reload();
    await chatScroll(page).waitFor({ state: "visible" });
    await expect
      .poll(async () => (await metrics(page)).distanceFromBottom, { timeout: 30_000 })
      .toBeLessThan(50);
    await expect(scrollToBottomBtn(page)).toBeHidden();
  });

  // ── chat-transcript-virtualization: "Jump to an off-screen turn" ──────────
  test("scrollToTurn reaches an unmounted (off-screen) turn", async ({ page }) => {
    // ChatViewHandle.scrollToTurn -> virtualizer.scrollToIndex. The OLD
    // querySelector path returned null for an unmounted turn; the map-based path
    // scrolls it into view. The TokenStatsBar turn bar is the jump affordance.
    await startLongStream(page);
    await waitForTail(page); // settled at bottom; oldest turn is off-screen

    const firstTurnBar = byTestId(page, "turnBar").first();
    await firstTurnBar.waitFor({ state: "visible", timeout: 30_000 });
    await firstTurnBar.click();

    // Jumping to the oldest turn scrolls far up from the bottom and suspends
    // follow (scroll-to-bottom button appears).
    await expect
      .poll(async () => (await metrics(page)).distanceFromBottom, { timeout: 15_000 })
      .toBeGreaterThan(200);
    await expect(scrollToBottomBtn(page)).toBeVisible();
  });

  // ── chat-transcript-virtualization: "Streaming tail always rendered" ──────
  test("streaming tail stays mounted while scrolled up in history", async ({ page }) => {
    await startLongStream(page);

    // The live streaming bubble renders as `.chat-stream-live` (a static sibling
    // BELOW the virtual spacer — never windowed). Catch it mid-stream, scroll far
    // up, and assert it is still attached even though below the viewport.
    const live = page.locator(".chat-stream-live");
    await live.first().waitFor({ state: "attached", timeout: 60_000 });
    await chatScroll(page).evaluate((el) => el.scrollTo(0, 0));
    expect(await live.count()).toBeGreaterThan(0);
  });

  // ── chat-transcript-virtualization: "Layout/node count bounded" ───────────
  test("mounted row count is bounded by the viewport, not session length", async ({ page }) => {
    await startLongStream(page);
    await waitForTail(page); // ~120 turns → hundreds of display rows total

    // With windowing, only viewport + overscan (+ streaming tail siblings) are
    // mounted. Pre-Step-B this equalled the total row count (hundreds); post-Step-B
    // it is bounded well below.
    const { mountedRows } = await metrics(page);
    expect(mountedRows).toBeGreaterThan(0);
    expect(mountedRows).toBeLessThan(60);
  });
});
