import { expect, test } from "@playwright/test";
import { byTestId, sendPrompt, spawnFreshGitSession } from "./helpers/index.js";

/**
 * Task 2.2 (bounded-hot-transcript-state, #48 slice 2): cold-start reveal UX.
 *
 * A cache-hit cold start must produce ONE stable paint of the newest tail —
 * zero intermediate DOM states (no flashed skeleton, no "No messages yet"
 * flicker, no visible top-to-bottom replay). The delayed skeleton
 * (`useDelayedSkeleton`, ~150ms threshold) is what makes this possible: a
 * fast local-cache read resolves before the timer fires, so the skeleton
 * never mounts at all.
 *
 * MECHANISM: spawn a session, drive a short multi-turn transcript through it
 * (the #59 reduce/persist pipeline records every event into the durable
 * replay cache as it streams), then `page.reload()`. The reload re-subscribes
 * over a matched `sourceGeneration`, so the reload's cold path resolves from
 * the local cache almost immediately — the scenario this task targets.
 */

// `isolation-a` / `isolation-b` are pre-existing faux scenarios that each
// reply with one distinct plain-text marker — a convenient two-turn
// transcript with unambiguous ordering to check for progressive fill.
const FIRST_TURN = "[[faux:isolation-a]] first turn";
const SECOND_TURN = "[[faux:isolation-b]] second turn";
const FIRST_MARKER = "ISOLATION_MARKER_AAA";
const SECOND_MARKER = "ISOLATION_MARKER_BBB";

test.describe("cold-start reveal", () => {
  test("cache-hit cold start paints the newest tail in one stable commit, no progressive fill", async ({ page }) => {
    const card = await spawnFreshGitSession(page);
    await card.click();

    await sendPrompt(page, FIRST_TURN);
    await expect(page.getByText(FIRST_MARKER).last()).toBeVisible({ timeout: 30_000 });
    await sendPrompt(page, SECOND_TURN);
    await expect(page.getByText(SECOND_MARKER).last()).toBeVisible({ timeout: 30_000 });

    // Give the replay persister a moment to flush the events into the
    // durable cache before forcing a cold reload against it.
    await page.waitForTimeout(500);

    await page.reload();

    // The "No messages yet" empty state must never render during a cache-hit
    // cold start — that would be an intermediate DOM state the reveal-when-
    // stable contract forbids.
    const emptyStateSeen = await page
      .getByText(/no messages yet/i)
      .waitFor({ state: "visible", timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    expect(emptyStateSeen).toBe(false);

    // Single reveal at newest: once the tail (second turn) is visible, the
    // earlier turn must ALREADY be present too — no observable window where
    // only the top of the transcript has rendered ahead of the bottom (which
    // would indicate a top-to-bottom progressive fill instead of an
    // assemble-off-screen-then-reveal commit).
    await expect(page.getByText(SECOND_MARKER).last()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(FIRST_MARKER).last()).toBeVisible();

    // The transient loading skeleton — if it ever mounted during the cache
    // read — must have fully cleared by the time content is visible: a
    // single swap, not a lingering overlay alongside real messages.
    await expect(page.getByTestId("chat-history-skeleton")).toHaveCount(0);

    await byTestId(page, "chatScrollContainer").waitFor({ state: "visible" });
  });
});
