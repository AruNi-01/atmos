import { expect, test } from "../../../fixtures/test";
import { expectHealthyRoute } from "../support/app-smoke";

test.describe("smoke onboarding remote", () => {
  test("@smoke shows remote onboarding fields without writing settings", async ({
    page,
  }) => {
    await expectHealthyRoute(page, "en", "/setup");

    const remoteTab = page.getByRole("tab", { name: /Remote/i });

    await expect(remoteTab).toBeVisible({
      timeout: 30_000,
    });
    await remoteTab.click();

    await expect(remoteTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: /Access Key/i })).toBeVisible();
    await expect(page.getByPlaceholder("Paste access key")).toBeVisible();
    await expect(page.getByRole("button", { name: /Use key/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Available Computers/i }),
    ).toBeVisible();
  });
});
