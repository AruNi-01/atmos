import { expect, test } from "../../../fixtures/test";
import { expectHealthyRoute } from "../support/app-smoke";

test.describe("smoke onboarding private relay", () => {
  test("@smoke expands private relay fields without saving remote settings", async ({
    page,
  }) => {
    await expectHealthyRoute(page, "en", "/setup");

    const remoteTab = page.getByRole("tab", { name: /Remote/i });
    await expect(remoteTab).toBeVisible({
      timeout: 30_000,
    });
    await remoteTab.click();

    await expect(page.getByRole("heading", { name: /Access Key/i })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /Private relay/i }).click();

    const relayUrlField = page.getByPlaceholder("wss://relay.example.com");
    const relayTokenField = page.getByPlaceholder("Paste relay token");

    await expect(relayUrlField).toBeVisible();
    await expect(relayTokenField).toBeVisible();
  });
});
