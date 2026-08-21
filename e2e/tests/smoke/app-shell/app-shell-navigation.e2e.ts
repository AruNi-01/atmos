import { expect, test } from "../../../fixtures/test";
import {
  connectLocalComputer,
  stubComputerClientSettingsApi,
} from "../support/app-smoke";

test.describe("smoke app shell navigation", () => {
  test("@smoke @stateful exercises app shell navigation and global search surfaces", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go forward" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh page" }).click();
    await expect(page.getByRole("button", { name: /Search/ })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /Search/ }).click({ noWaitAfter: true });
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
    await expect(page.getByRole("combobox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeHidden();

    await page.getByRole("button", { name: "Usage", exact: true }).click();
    const usageDialog = page.getByRole("dialog").filter({ hasText: "All Providers" });
    await expect(usageDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(usageDialog).toBeHidden();
  });
});
