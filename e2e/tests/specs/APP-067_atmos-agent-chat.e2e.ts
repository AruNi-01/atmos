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

  test("S16 standalone /agent-chat?chatId= shares the chat", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await connectLocalComputer(page);
    await page.goto("/agent-chat");
    await expect(page.locator("[data-agent-chat-workspace]").first()).toBeVisible({
      timeout: 30_000,
    });
    const composerRoot = page.locator("[data-agent-chat-composer]").first();
    await expect(composerRoot).toBeVisible({ timeout: 15_000 });
    const composer = composerRoot.locator("[data-prompt-composer-editor]").first();
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await expect(composer).toHaveAttribute("contenteditable", "true", { timeout: 45_000 });
    await expect(composer).toBeEnabled();

    const marker = `s16-fanout-${Date.now()}`;
    await composer.click();
    await composer.fill(marker);
    await composer.press("Enter");
    await expect(page.locator("[data-agent-chat-message]").getByText(marker)).toBeVisible({
      timeout: 30_000,
    });

    const chatId = await page
      .locator("[data-agent-chat-workspace]")
      .first()
      .getAttribute("data-agent-chat-workspace");
    expect(chatId && chatId !== "draft").toBeTruthy();

    const page2 = await page.context().newPage();
    await page2.goto(`/agent-chat?chatId=${chatId}`);
    await expect(
      page2.locator(`[data-agent-chat-workspace="${chatId}"]`),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page2.locator("[data-agent-chat-message]").getByText(marker)).toBeVisible({
      timeout: 20_000,
    });
    await page2.close();
  });
});
