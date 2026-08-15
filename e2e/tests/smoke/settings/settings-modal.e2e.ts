import { expect, test } from "../../../fixtures/test";
import {
  connectLocalComputer,
  closeSettingsPage,
  gotoSettingsRoute,
  normalizePathname,
  openSettingsPage,
  stubComputerClientSettingsApi,
} from "../support/app-smoke";

const SETTINGS_HEADINGS: Record<string, RegExp> = {
  shortcuts: /^(Shortcuts|快捷键)$/,
  layout: /^(Layout|布局)$/,
  "atmos-computer": /^Atmos Computer$/,
  about: /^(About|关于)$/,
};

test.describe("smoke settings", () => {
  test("@smoke @stateful opens settings from the left sidebar and closes from the back button", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await openSettingsPage(page);
    await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^(Layout|Appearance|布局|外观)$/ }).first()).toBeVisible();

    await closeSettingsPage(page);
  });

  test("@smoke @stateful boots settings from a deep-linked shortcuts tab", async ({ page }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await gotoSettingsRoute(page, "shortcuts");
    await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: SETTINGS_HEADINGS.shortcuts })).toBeVisible();

    await closeSettingsPage(page);
  });

  test("@smoke @stateful keeps the settings page while switching deep-linked tabs", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    for (const activeSettingTab of ["layout", "atmos-computer", "about"] as const) {
      await gotoSettingsRoute(page, activeSettingTab);
      await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);
      await expect
        .poll(async () => normalizePathname(new URL(page.url()).pathname))
        .toBe("/settings");
      await expect(page.getByRole("heading", { name: SETTINGS_HEADINGS[activeSettingTab] })).toBeVisible();
    }

    await closeSettingsPage(page);
  });
});
