import { expect, test } from "../../../fixtures/test";
import { expectHealthyRoute } from "../support/app-smoke";

test.describe("smoke onboarding local", () => {
  test("@smoke shows the local onboarding tab by default", async ({ page }) => {
    await expectHealthyRoute(page, "en", "");

    const localTab = page.getByRole("tab", { name: "Local" });
    const remoteTab = page.getByRole("tab", { name: "Remote" });

    await expect(localTab).toBeVisible({
      timeout: 30_000,
    });
    await expect(remoteTab).toBeVisible();
    await expect(localTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Local Atmos Computer" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  });

  test("@smoke keeps local health-check actions on the onboarding route", async ({
    page,
  }) => {
    await expectHealthyRoute(page, "en", "");

    await expect(page.getByRole("tab", { name: "Local" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(
      page.getByRole("heading", { name: "Local Atmos Computer" }),
    ).toBeVisible();
  });
});
