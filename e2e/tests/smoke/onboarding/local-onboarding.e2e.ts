import { expect, test } from "../../../fixtures/test";
import { expectHealthyRoute } from "../support/app-smoke";

test.describe("smoke onboarding local", () => {
  test("@smoke shows the local onboarding tab", async ({ page }) => {
    await expectHealthyRoute(page, "en", "/setup");

    const localTab = page.getByRole("tab", { name: /^Local$/i });
    const remoteTab = page.getByRole("tab", { name: /^Remote$/i });

    await expect(localTab).toBeVisible({
      timeout: 30_000,
    });
    await expect(remoteTab).toBeVisible();
    await localTab.click();
    await expect(localTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: /Local Atmos Computer/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  });

  test("@smoke keeps local health-check actions on the onboarding route", async ({
    page,
  }) => {
    await expectHealthyRoute(page, "en", "/setup");

    await expect(page.getByRole("tab", { name: /^Local$/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("tab", { name: /^Local$/i }).click();
    await expect(page.getByRole("tab", { name: /^Local$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(
      page.getByRole("heading", { name: /Local Atmos Computer/i }),
    ).toBeVisible();
  });
});
