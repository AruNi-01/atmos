import { expect, test } from "../../../fixtures/test";
import {
  buildProjectWorkspaceDeepLink,
  connectLocalComputer,
  gotoContextRoute,
  normalizePathname,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../support/app-smoke";

test.describe("smoke project", () => {
  test("@smoke @stateful boots project context route with stable params", async ({ page }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const contextUrl = await buildProjectWorkspaceDeepLink(page, "zh");
    const projectUrl = withSearchParams(contextUrl, {
      activeSettingTab: null,
    });

    await gotoContextRoute(page, projectUrl);
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/zh/project");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("id"))
      .toBeTruthy();
    await expect
      .poll(async () => {
        const pvUrl = new URL(page.url()).searchParams.get("pvUrl");
        if (!pvUrl) return "";
        const parsed = new URL(pvUrl);
        return `${normalizePathname(parsed.pathname)}:${parsed.searchParams.has("id")}`;
      })
      .toBe("/zh/workspace:true");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsTab"))
      .toBe("files");
  });

  test("@smoke @stateful keeps project route stable while switching read-only sidebar and settings params", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const contextUrl = await buildProjectWorkspaceDeepLink(page, "zh");
    const projectUrl = withSearchParams(contextUrl, {
      activeSettingTab: null,
      rsTab: "files",
    });

    await gotoContextRoute(page, withSearchParams(projectUrl, { lsTab: "projects" }));
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/zh/project");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsTab"))
      .toBe("projects");

    const settingsDialog = page.getByRole("dialog");

    await gotoContextRoute(
      page,
      withSearchParams(projectUrl, {
        lsTab: "files",
        settingsModal: "true",
        activeSettingTab: "about",
      }),
    );
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("settingsModal"))
      .toBe("true");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe("about");
    await expect(settingsDialog).toBeVisible();

    await gotoContextRoute(
      page,
      withSearchParams(projectUrl, {
        lsTab: "files",
        settingsModal: "true",
        activeSettingTab: "workspace",
      }),
    );
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe("workspace");
    await expect(settingsDialog).toBeVisible();

    await settingsDialog.getByRole("button", { name: /close/i }).click();
    await expect(settingsDialog).toBeHidden();
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("settingsModal") ?? "false")
      .toBe("false");
  });
});
