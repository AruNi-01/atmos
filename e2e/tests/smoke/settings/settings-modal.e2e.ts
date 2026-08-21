import { expect, test } from "../../../fixtures/test";
import {
  connectLocalComputer,
  closeSettingsPage,
  gotoSettingsRoute,
  normalizePathname,
  openSettingsPage,
  stubComputerClientSettingsApi,
} from "../support/app-smoke";

const SETTINGS_SIDEBAR_ITEMS: Record<string, RegExp> = {
  keyboard: /^(Keyboard|键盘)$/,
  interface: /^(Interface|界面)$/,
  "remote-access": /^(Remote Access|远程访问)$/,
  general: /^(General|通用)$/,
};

test.describe("smoke settings", () => {
  test("@smoke @stateful opens settings from the left sidebar and closes from the back button", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await openSettingsPage(page);
    await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: SETTINGS_SIDEBAR_ITEMS.interface })).toBeVisible();

    await closeSettingsPage(page);
  });

  test("@smoke @stateful boots settings from a deep-linked shortcuts tab", async ({ page }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await gotoSettingsRoute(page, "keyboard");
    await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: SETTINGS_SIDEBAR_ITEMS.keyboard })).toBeVisible();

    await closeSettingsPage(page);
  });

  test("@smoke @stateful keeps the settings page while switching deep-linked tabs", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    for (const activeSettingTab of ["interface", "remote-access", "general"] as const) {
      await gotoSettingsRoute(page, activeSettingTab);
      await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);
      await expect
        .poll(async () => normalizePathname(new URL(page.url()).pathname))
        .toBe("/settings");
      await expect(page.getByRole("button", { name: SETTINGS_SIDEBAR_ITEMS[activeSettingTab] })).toBeVisible();
    }

    await closeSettingsPage(page);
  });
});
