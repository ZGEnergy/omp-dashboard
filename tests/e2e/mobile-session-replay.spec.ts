import { expect, type Locator, type Page, type WebSocket as PWWebSocket, test } from "@playwright/test";
import { byTestId, sendPrompt, spawnFreshGitSession } from "./helpers/index.js";

const PLAIN_TEXT_MARKER = "The quick brown faux jumps over the lazy dog.";
const LONG_TRANSCRIPT_TAIL = "long-transcript complete";

interface ReplayFrame {
  type: string;
  sessionId?: string;
  events?: unknown[];
  isLast?: boolean;
  errorCode?: string;
}

interface SubscribeFrame {
  type: string;
  sessionId?: string;
  lastSeq?: number;
}

function parseSubscribe(payload: string): SubscribeFrame | null {
  try {
    const message = JSON.parse(payload) as SubscribeFrame;
    return message.type === "subscribe" ? message : null;
  } catch {
    return null;
  }
}

function parseReplay(payload: string): ReplayFrame | null {
  try {
    const message = JSON.parse(payload) as ReplayFrame;
    return message.type === "event_replay" ? message : null;
  } catch {
    return null;
  }
}

const chatScroll = (page: Page) => byTestId(page, "chatScrollContainer");

async function scrollMetrics(scroller: Locator) {
  return scroller.evaluate((el) => ({
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    clientWidth: el.clientWidth,
  }));
}

/**
 * Drive a browser-level touch sequence. Playwright exposes tap, but not a
 * swipe; Chromium's input domain gives this test a real touch gesture rather
 * than a synthetic scrollTop write. A finger moving down makes the transcript
 * move upward toward older rows.
 */
async function touchSwipe(page: Page, scroller: Locator, fromFraction: number, toFraction: number): Promise<void> {
  const box = await scroller.boundingBox();
  if (!box) throw new Error("chat scroller is not laid out");
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const fromY = box.y + box.height * fromFraction;
  const toY = box.y + box.height * toFraction;
  try {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: fromY, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
    });
    for (let step = 1; step <= 6; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: fromY + (toY - fromY) * (step / 6), id: 1, radiusX: 1, radiusY: 1, force: 1 }],
      });
      await page.waitForTimeout(24);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

async function visibleAnchor(scroller: Locator) {
  return scroller.evaluate((el) => {
    const viewport = el.getBoundingClientRect();
    const row = Array.from(el.querySelectorAll<HTMLElement>("[data-index]")).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.bottom > viewport.top + 8 && rect.top < viewport.bottom - 8 && (candidate.textContent?.trim().length ?? 0) > 0;
    });
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return {
      identity: row.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) ?? "",
      offset: rect.top - viewport.top,
      index: row.dataset.index ?? "",
    };
  });
}

test.describe("@mobile-replay mobile session activation", () => {
  test("session selection rehydrates a populated transcript after replay settles", async ({ page }) => {
    test.setTimeout(300_000);

    const card = await spawnFreshGitSession(page);
    const sessionId = await card.getAttribute("data-session-id");
    expect(sessionId).toBeTruthy();

    const sockets: { closed: boolean; replayEvents: number; replayTerminals: number; replayErrors: string[] }[] = [];
    page.on("websocket", (ws: PWWebSocket) => {
      if (new URL(ws.url()).pathname !== "/ws") return;
      const socket = { closed: false, replayEvents: 0, replayTerminals: 0, replayErrors: [] as string[] };
      sockets.push(socket);
      ws.on("framereceived", (frame) => {
        const payload = typeof frame.payload === "string" ? frame.payload : frame.payload.toString("utf8");
        const replay = parseReplay(payload);
        if (!replay || replay.sessionId !== sessionId || !Array.isArray(replay.events)) return;
        socket.replayEvents += replay.events.length;
        if (replay.isLast) socket.replayTerminals += 1;
        if (replay.errorCode) socket.replayErrors.push(replay.errorCode);
      });
      ws.on("close", () => {
        socket.closed = true;
      });
    });

    await card.click();
    // The shared 120-turn fixture emits hundreds of persisted events, so this
    // seeds a real cold replay larger than REPLAY_QUEUE_EVENT_CAP (256).
    await sendPrompt(page, "[[faux:long-transcript]] mobile rehydrate");
    await expect(page.getByText(LONG_TRANSCRIPT_TAIL).last()).toBeVisible({ timeout: 240_000 });

    // Let the debounced replay-cache writer flush before replacing the app.
    await page.waitForTimeout(1_800);
    await page.goto("/");
    await byTestId(page, "headerAppBar").waitFor({ state: "visible" });

    // Selecting the existing session from the mobile list is the real
    // rehydration trigger after the prior app instance has been discarded.
    const rehydratedCard = page.locator(
      `[data-testid="session-card-desktop"][data-session-id="${sessionId}"]`,
    );
    await expect(rehydratedCard).toBeVisible({ timeout: 60_000 });
    await rehydratedCard.click();
    await expect(chatScroll(page)).toBeVisible({ timeout: 30_000 });

    // The regression must paint the previously populated transcript, not
    // merely reconnect the socket or hide the history-loading placeholder.
    await expect(page.getByText(LONG_TRANSCRIPT_TAIL).last()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("chat-history-skeleton")).toBeHidden();
    await expect
      .poll(
        () => sockets.some((socket) => socket.replayEvents > 256 && socket.replayTerminals === 1 && !socket.closed && socket.replayErrors.length === 0),
        { timeout: 30_000 },
      )
      .toBe(true);
    const visibleTranscript = await chatScroll(page).innerText();
    expect(visibleTranscript).toContain(LONG_TRANSCRIPT_TAIL);
    expect(visibleTranscript).not.toContain("…[truncated]");
    const socketCountAfterReplay = sockets.length;
    await page.waitForTimeout(1_000);
    expect(sockets).toHaveLength(socketCountAfterReplay);
    expect(sockets.at(-1)?.closed).toBe(false);
  });

  test("Chromium touch paging restores the visible DOM anchor after older replay", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "touch CDP swipe assertions are Chromium-only");
    test.setTimeout(300_000);

    const card = await spawnFreshGitSession(page);
    await card.click();
    await sendPrompt(page, "[[faux:long-transcript]] mobile history");

    const transcript = chatScroll(page);
    await expect(page.getByText(LONG_TRANSCRIPT_TAIL).last()).toBeVisible({ timeout: 240_000 });
    await expect
      .poll(async () => (await scrollMetrics(transcript)).scrollHeight - (await scrollMetrics(transcript)).clientHeight, { timeout: 60_000 })
      .toBeGreaterThan(600);

    // The byte-bounded cold tail must advertise a real older page before the
    // gesture can exercise the exclusive older completion path.
    const olderButton = page.getByTestId("load-older-button");
    await expect(olderButton).toBeVisible({ timeout: 60_000 });

    // First gesture leaves a stable, non-bottom viewport and a concrete row
    // identity to track. This is a browser-observed touch scroll, not a DOM
    // scrollTop assignment.
    await touchSwipe(page, transcript, 0.34, 0.60);
    await expect.poll(async () => (await scrollMetrics(transcript)).scrollTop, { timeout: 15_000 }).toBeGreaterThan(100);
    const anchorBefore = await visibleAnchor(transcript);
    expect(anchorBefore).not.toBeNull();

    // Capture the loading transition before the second gesture so a fast
    // server response cannot make the test accidentally accept the initial
    // "Load older messages" button as completion.
    const loadingStarted = page.waitForFunction(
      () => document.querySelector('[data-testid="load-older-status"]')?.textContent?.includes("Loading older") === true,
      undefined,
      { timeout: 60_000 },
    );
    await touchSwipe(page, transcript, 0.28, 0.92);
    await loadingStarted;
    await expect(olderButton).toBeVisible({ timeout: 60_000 });

    // Older rows were prepended, but the same DOM row must retain its visible
    // identity and pixel offset. Also prove the user gesture still owns the
    // viewport after completion rather than being re-pinned to the tail.
    const anchorAfter = await visibleAnchor(transcript);
    expect(anchorAfter?.identity).toBe(anchorBefore?.identity);
    expect(Math.abs((anchorAfter?.offset ?? Number.NaN) - (anchorBefore?.offset ?? Number.NaN))).toBeLessThan(6);
    expect((await scrollMetrics(transcript)).scrollTop).toBeLessThan(
      (await scrollMetrics(transcript)).scrollHeight - (await scrollMetrics(transcript)).clientHeight - 100,
    );
    await expect(page.getByTestId("scroll-to-bottom")).toBeVisible();
  });

  test("mounted detail stays inert and offscreen while the mobile list is active", async ({ page }) => {
    const card = await spawnFreshGitSession(page);
    await card.click();
    await sendPrompt(page, "[[faux:plain-text]] mobile hidden detail");

    const transcript = chatScroll(page);
    await expect(page.getByText(PLAIN_TEXT_MARKER).first()).toBeVisible({ timeout: 30_000 });
    const detailPanel = page.locator('[aria-hidden="false"]').filter({ has: transcript }).first();
    await expect(detailPanel).toHaveAttribute("aria-hidden", "false");
    const before = await scrollMetrics(transcript);

    await byTestId(page, "back-button").click();
    const hiddenDetail = page.locator('[aria-hidden="true"]').filter({ has: transcript }).first();
    await expect(hiddenDetail).toHaveAttribute("aria-hidden", "true");
    await expect(card).toBeVisible();
    await expect(transcript).not.toBeInViewport();

    // A wheel delivered to the still-mounted hidden transcript must not move
    // its scroll state or steal interaction from the visible list panel.
    await transcript.evaluate((el) => el.dispatchEvent(new WheelEvent("wheel", { deltaY: -900, bubbles: true })));
    const after = await scrollMetrics(transcript);
    expect(after.scrollTop).toBe(before.scrollTop);
    const hitTarget = await page.evaluate(() => {
      const visiblePanel = document.querySelector('[aria-hidden="false"]');
      const rect = visiblePanel?.getBoundingClientRect();
      if (!rect) return null;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 40);
      return hit?.closest('[aria-hidden="true"]') !== null;
    });
    expect(hitTarget).toBe(false);

    // Re-activation is a real navigation back into the mounted detail panel.
    await card.click();
    await expect(detailPanel).toHaveAttribute("aria-hidden", "false");
    await expect(transcript).toBeInViewport();
    await expect(page.getByText(PLAIN_TEXT_MARKER).first()).toBeVisible();
  });

  test("WebKit pageshow activation keeps the mobile button state through orientation and reload", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "activation/orientation assertions are WebKit-safe and separate from Chromium touch coverage");

    const sockets: { closed: boolean; subscribes: SubscribeFrame[] }[] = [];
    page.on("websocket", (ws: PWWebSocket) => {
      if (new URL(ws.url()).pathname !== "/ws") return;
      const socket = { closed: false, subscribes: [] as SubscribeFrame[] };
      sockets.push(socket);
      ws.on("framesent", (frame) => {
        const payload = typeof frame.payload === "string" ? frame.payload : frame.payload.toString("utf8");
        const subscribe = parseSubscribe(payload);
        if (subscribe) socket.subscribes.push(subscribe);
      });
      ws.on("close", () => {
        socket.closed = true;
      });
    });

    const card = await spawnFreshGitSession(page);
    const sessionId = await card.getAttribute("data-session-id");
    expect(sessionId).toBeTruthy();
    await card.click();
    await sendPrompt(page, "[[faux:tool-screenshot]] mobile activation");

    const transcript = chatScroll(page);
    const screenshotText = page.getByText("screenshot captured").first();
    await expect(screenshotText).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('img[src^="data:image/png;base64,"]').first()).toBeVisible({ timeout: 30_000 });
    const priorScreenshotNode = await screenshotText.elementHandle();
    if (!priorScreenshotNode) throw new Error("screenshot text did not mount");
    const initialSockets = sockets.slice();
    expect(initialSockets).toHaveLength(1);
    const portrait = await scrollMetrics(transcript);
    await expect(page.getByTestId("scroll-to-bottom")).toBeHidden();

    // pageshow plus visibilitychange coalesce to one replacement socket. It
    // must cold-replay this session, detach old rendered nodes, then rehydrate.
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect
      .poll(
        () => {
          const replacements = sockets.slice(initialSockets.length);
          return initialSockets.every((socket) => socket.closed) && replacements.length === 1 && replacements[0]?.subscribes.some(
            (subscribe) => subscribe.sessionId === sessionId && subscribe.lastSeq === 0,
          );
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.waitForTimeout(300);
    expect(sockets.slice(initialSockets.length)).toHaveLength(1);
    await expect.poll(() => priorScreenshotNode.evaluate((node) => node.isConnected), { timeout: 30_000 }).toBe(false);
    await expect(screenshotText).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('img[src^="data:image/png;base64,"]').first()).toBeVisible({ timeout: 30_000 });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(transcript).toBeVisible();
    const landscape = await scrollMetrics(transcript);
    expect(landscape.clientWidth).toBeGreaterThan(landscape.clientHeight);
    expect(landscape.clientHeight).toBeLessThan(portrait.clientHeight);
    await expect(page.getByTestId("scroll-to-bottom")).toBeHidden();

    await page.reload();
    await expect(byTestId(page, "headerAppBar")).toBeVisible();
    await expect(transcript).toBeVisible();
    await expect(page.locator('img[src^="data:image/png;base64,"]').first()).toBeVisible({ timeout: 30_000 });
    const restored = await scrollMetrics(transcript);
    expect(restored.scrollHeight - restored.scrollTop - restored.clientHeight).toBeLessThan(50);
    await expect(page.getByTestId("scroll-to-bottom")).toBeHidden();
  });
});
