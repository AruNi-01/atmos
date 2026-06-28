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
    await expect
      .poll(async () => new URL(page.url()).pathname.startsWith("/zh"))
      .toBe(true);
  });
});
