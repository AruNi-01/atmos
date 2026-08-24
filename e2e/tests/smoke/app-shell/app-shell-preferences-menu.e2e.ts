import { expect, test } from "../../../fixtures/test";
import {
  connectLocalComputer,
  gotoSettingsRoute,
  stubComputerClientSettingsApi,
} from "../support/app-smoke";

test.describe("smoke app shell preferences menu", () => {
  test("@smoke @stateful exercises theme and language controls from Appearance settings", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await gotoSettingsRoute(page, "general");
    await expect(page.getByRole("tab", { name: /^(Light|浅色)$/ })).toBeVisible();

    await page.getByRole("tab", { name: /^(Light|浅色)$/ }).click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains("light")))
      .toBe(true);

    await page.getByRole("combobox", { name: /^(Language|语言)$/ }).click();
    await page.getByRole("option", { name: /简体中文/ }).click();
    await expect
      .poll(async () => page.locator("html").getAttribute("lang"))
      .toBe("zh");
    // APP-028: runtime locale must not navigate to /zh/...
    await expect
      .poll(async () => new URL(page.url()).pathname)
      .not.toMatch(/^\/zh(\/|$)/);
    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem("atmos:v1:global:locale")),
      )
      .toBe("zh");
  });
});
