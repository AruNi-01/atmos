import { expect, test } from "../../../fixtures/test";
import {
  buildProjectWorkspaceDeepLink,
  connectLocalComputer,
  gotoContextRoute,
  normalizePathname,
  openActionMenu,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../support/app-smoke";

test.describe("smoke settings", () => {
  test("@smoke @stateful opens settings from the header menu and closes from the dialog button", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await openActionMenu(page);
    await page.getByText("Settings", { exact: true }).click();

    const settingsDialog = page.getByRole("dialog");
    await expect(settingsDialog).toBeVisible();
    await settingsDialog.getByRole("button", { name: /close/i }).click();
    await expect(settingsDialog).toBeHidden();
  });

  test("@smoke @stateful boots settings modal from project context route params", async ({ page }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const contextUrl = await buildProjectWorkspaceDeepLink(page, "zh");
    const settingsUrl = withSearchParams(contextUrl, {
      settingsModal: "true",
      activeSettingTab: "shortcuts",
      rsTab: null,
    });

    await gotoContextRoute(page, settingsUrl);
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/zh/project");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe("shortcuts");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("settingsModal"))
      .toBe("true");

    const settingsDialog = page.getByRole("dialog");
    await expect(settingsDialog).toBeVisible();
    await settingsDialog.getByRole("button", { name: /close/i }).click();
    await expect(settingsDialog).toBeHidden();
  });

  test("@smoke @stateful keeps settings modal open while switching deep-linked read-only tabs", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const contextUrl = await buildProjectWorkspaceDeepLink(page, "zh");
    const settingsDialog = page.getByRole("dialog");

    for (const activeSettingTab of ["layout", "atmos-computer", "about"] as const) {
      await gotoContextRoute(
        page,
        withSearchParams(contextUrl, {
          settingsModal: "true",
          activeSettingTab,
          rsTab: null,
        }),
      );
      await expect
        .poll(async () => normalizePathname(new URL(page.url()).pathname))
        .toBe("/zh/project");
      await expect
        .poll(async () => new URL(page.url()).searchParams.get("settingsModal"))
        .toBe("true");
      await expect
        .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
        .toBe(activeSettingTab);
      await expect(settingsDialog).toBeVisible();
    }

    await settingsDialog.getByRole("button", { name: /close/i }).click();
    await expect(settingsDialog).toBeHidden();
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("settingsModal") ?? "false")
      .toBe("false");
  });
});
