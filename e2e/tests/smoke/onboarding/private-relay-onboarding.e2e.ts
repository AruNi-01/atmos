import { expect, test } from "../../../fixtures/test";
import { expectHealthyRoute } from "../support/app-smoke";

test.describe("smoke onboarding private relay", () => {
  test("@smoke expands private relay fields without saving remote settings", async ({
    page,
  }) => {
    await expectHealthyRoute(page, "en", "/setup");

    const remoteTab = page.getByRole("tab", { name: /Remote/i });
    await expect(remoteTab).toBeVisible();
    await remoteTab.click();

    await expect(page.getByRole("heading", { name: /Access Key/i })).toBeVisible({
      timeout: 30_000,
    });

    const relayUrlField = page.getByPlaceholder("https://relay.atmos.land");
    const relayTokenField = page.getByPlaceholder("For private relays");

    await expect(relayUrlField).toBeVisible();
    await expect(relayTokenField).toBeVisible();
  });
});
