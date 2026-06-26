import { expect, test } from "../../fixtures/test";
import { stubUnavailableLocalApi } from "../../fixtures/local-api";

test.describe("web setup", () => {
  test("@smoke renders setup onboarding controls", async ({ page }) => {
    await stubUnavailableLocalApi(page);

    await page.goto("/en/setup", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByText("Connect a local Atmos Server or pick a remote computer to enter your workspace."),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Local Server" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Remote Computer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate Key" })).toBeVisible();

    await page.getByRole("tab", { name: "Local Server" }).click();
    await expect(page.getByRole("heading", { name: "Local Atmos Server" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  });
});
