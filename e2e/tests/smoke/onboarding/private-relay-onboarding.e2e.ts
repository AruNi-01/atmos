import { expect, test } from "../../../fixtures/test";
import { expectHealthyRoute } from "../support/app-smoke";

test.describe("smoke onboarding private relay", () => {
  test("@smoke expands private relay fields without saving remote settings", async ({
    page,
  }) => {
    await expectHealthyRoute(page, "en", "");

    await page.getByRole("tab", { name: "Remote" }).click();

    const privateRelayButton = page.getByRole("button", { name: /Private relay/i });
    const relayUrlField = page.getByPlaceholder("wss://relay.example.com");
    const relayTokenField = page.getByPlaceholder("Paste relay token");

    await expect(privateRelayButton).toBeVisible();
    await expect(relayUrlField).toBeHidden();
    await expect(relayTokenField).toBeHidden();

    await privateRelayButton.click();

    await expect(relayUrlField).toBeVisible();
    await expect(relayTokenField).toBeVisible();
  });
});
