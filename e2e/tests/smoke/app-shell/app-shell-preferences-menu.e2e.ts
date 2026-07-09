import { expect, test } from "../../../fixtures/test";
import {
  connectLocalComputer,
  openActionMenu,
  stubComputerClientSettingsApi,
} from "../support/app-smoke";

test.describe("smoke app shell preferences menu", () => {
  test("@smoke @stateful exercises theme and language controls from the header menu", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const pathnameBefore = new URL(page.url()).pathname;

    await openActionMenu(page);
    await page.getByText("Theme", { exact: true }).click();
    await page.getByText(/Light/).click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains("light")))
      .toBe(true);

    await openActionMenu(page);
    const languageTrigger = page.getByRole("menuitem", { name: /Language/ });
    await languageTrigger.focus();
    await page.keyboard.press("ArrowRight");
    const zhOption = page.getByRole("menuitem", { name: /简体中文/ });
    await expect(zhOption).toBeVisible();
    await zhOption.click();
    await expect
      .poll(async () => page.locator("html").getAttribute("lang"))
      .toBe("zh");
    // APP-028: runtime locale must not navigate to /zh/...
    await expect
      .poll(async () => new URL(page.url()).pathname)
      .toBe(pathnameBefore);
    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem("atmos:v1:global:locale")),
      )
      .toBe("zh");
  });
});
