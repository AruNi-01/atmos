import { expect, test } from "../../fixtures/test";
import {
  buildProjectWorkspaceDeepLink,
  connectLocalComputer,
  getCenterStage,
  gotoContextRoute,
  withSearchParams,
} from "../smoke/support/app-smoke";

test.describe("APP-067 Atmos Agent Chat", () => {
  test("S1 plus menu New Agent Chat opens a center-stage tab next to New Terminal", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await connectLocalComputer(page);
    const contextUrl = withSearchParams(await buildProjectWorkspaceDeepLink(page), {
      activeSettingTab: null,
      tab: null,
    });
    await gotoContextRoute(page, contextUrl);

    const plusTrigger = page
      .locator("main [data-center-stage-plus-trigger]")
      .filter({ visible: true })
      .first();
    await expect(plusTrigger).toBeVisible({ timeout: 15_000 });
    if ((await plusTrigger.getAttribute("aria-expanded")) !== "true") {
      await plusTrigger.evaluate((el) => (el as HTMLButtonElement).click());
    }
    const plusMenu = page.locator("[data-center-stage-plus-menu]");
    await expect(plusMenu).toBeVisible({ timeout: 15_000 });

    const newAgentChat = plusMenu.locator("#create-agent-chat");
    const newTerminal = plusMenu.locator("#create-terminal");
    await expect(newAgentChat).toBeVisible({ timeout: 15_000 });
    await expect(newTerminal).toBeVisible();
    const agentBox = await newAgentChat.boundingBox();
    const terminalBox = await newTerminal.boundingBox();
    expect(agentBox && terminalBox).toBeTruthy();
    if (agentBox && terminalBox) {
      expect(agentBox.y).toBeGreaterThanOrEqual(terminalBox.y - 4);
    }

    await newAgentChat.click();
    const stage = await getCenterStage(page);
    await expect(stage.locator("[data-agent-chat-tab]").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(stage.locator("[data-agent-chat-workspace]").first()).toBeVisible();
  });

  test("S16 standalone /agent-chat?conversationId= shares the conversation", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await connectLocalComputer(page);
    await page.goto("/agent-chat");
    await expect(page.locator("[data-agent-chat-workspace]").first()).toBeVisible({
      timeout: 30_000,
    });
    const conversationId = await page
      .locator("[data-agent-chat-workspace]")
      .first()
      .getAttribute("data-agent-chat-workspace");
    expect(conversationId).toBeTruthy();
    await page.goto(`/agent-chat?conversationId=${conversationId}`);
    await expect(
      page.locator(`[data-agent-chat-workspace="${conversationId}"]`),
    ).toBeVisible({ timeout: 20_000 });
  });
});
