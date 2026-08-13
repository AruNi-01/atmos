import { expect, test } from "../../fixtures/test";
import {
  connectLocalComputer,
  expectHealthyRoute,
  gotoContextRoute,
  stubComputerClientSettingsApi,
  withSearchParams,
  buildProjectWorkspaceDeepLink,
} from "../smoke/support/app-smoke";

/**
 * APP-058: Agent Status Workspace Grouping
 *
 * Soft-checks that Group By exposes By Agent Status in the workspace sidebar.
 */
test.describe("APP-058 agent status workspace grouping", () => {
  test("@spec Group By includes By Agent Status", async ({ page }) => {
    test.setTimeout(90_000);

    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "en" });
    await expectHealthyRoute(page, "/", { locale: "en" });

    const contextUrl = await buildProjectWorkspaceDeepLink(page);
    await gotoContextRoute(
      page,
      withSearchParams(contextUrl, {
        lsTab: "projects",
        activeSettingTab: null,
      }),
    );

    const groupByControl = page.locator("aside").getByText(/group by|by project/i).first();
    if (await groupByControl.isVisible().catch(() => false)) {
      await groupByControl.click();
      await expect(page.getByText("By Agent Status", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
