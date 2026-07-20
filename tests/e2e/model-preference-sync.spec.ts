import { test, expect } from "@playwright/test";
import { byTestId, spawnFreshGitSession, sendPrompt } from "./helpers/index.js";

/**
 * Complete model/thinking preference round trip through the real Docker
 * dashboard → server → Pi bridge and Pi → bridge → server → rendered UI path.
 *
 * The slash command is registered only by the Docker faux extension fixture;
 * it stands in for a TUI-side change without injecting browser WebSocket
 * frames or fabricating session events.
 */
test.describe("model/thinking preference sync", () => {
  test("dashboard choices apply in Pi, then ordered Pi changes last-win in rendered UI", async ({ page }) => {
    await spawnFreshGitSession(page);

    const modelButton = byTestId(page, "modelSelectorButton");
    const thinkingButton = byTestId(page, "thinkingLevelButton");
    await expect(modelButton).toBeVisible();
    await expect(thinkingButton).toBeVisible();

    // Dashboard → Pi → dashboard: selecting a second faux model must come
    // back from the authoritative model_update, not stay optimistic only.
    await modelButton.click();
    const modelFilter = byTestId(page, "modelFilter");
    await modelFilter.fill("faux-2");
    const secondModel = byTestId(page, "modelRow").filter({ hasText: "faux-2" });
    await expect(secondModel).toHaveCount(1);
    await secondModel.click();
    await expect(modelButton).toContainText("faux/faux-2");

    // Dashboard → Pi → dashboard for thinking, too.
    await thinkingButton.click();
    await byTestId(page, "thinkingLevelDropdown").getByRole("button", { name: "high", exact: true }).click();
    await expect(thinkingButton).toContainText("high");

    // TUI/Pi-side fixture control emits model/thinking changes in order,
    // including clearing thinking (null input => Pi's rendered "off"). The
    // final snapshot must win after all bridge/server/browser round trips.
    await sendPrompt(page, "/e2e_model_sync faux/faux-1:low");
    await expect(modelButton).toContainText("faux/faux-1");
    await expect(thinkingButton).toContainText("low");
    await sendPrompt(page, "/e2e_model_sync faux/faux-2:null");
    await expect(modelButton).toContainText("faux/faux-2");
    await expect(thinkingButton).toContainText("off");
  });
});
