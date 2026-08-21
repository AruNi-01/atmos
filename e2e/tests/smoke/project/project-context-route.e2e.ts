import { expect, test } from "../../../fixtures/test";
import {
  buildProjectWorkspaceDeepLink,
  closeSettingsPage,
  connectLocalComputer,
  gotoContextRoute,
  gotoSettingsRoute,
  normalizePathname,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../support/app-smoke";

test.describe("smoke project", () => {
  test("@smoke @stateful boots project context route with stable params", async ({ page }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const contextUrl = await buildProjectWorkspaceDeepLink(page);
    const projectUrl = withSearchParams(contextUrl, {
      activeSettingTab: null,
    });

    await gotoContextRoute(page, projectUrl);
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/project");
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
      .toBe("/workspace:true");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBe("files");
  });

  test("@smoke @stateful keeps project route stable while switching read-only sidebar and settings params", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const contextUrl = await buildProjectWorkspaceDeepLink(page);
    const projectUrl = withSearchParams(contextUrl, {
      activeSettingTab: null,
      tab: "files",
    });

    await gotoContextRoute(page, withSearchParams(projectUrl, { lsTab: "projects" }));
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/project");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBe("files");

    await gotoSettingsRoute(page, "general");
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/settings");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe("general");
    await expect(page.getByRole("button", { name: /^(General|通用)$/ })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);

    await gotoSettingsRoute(page, "workspace");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe("workspace");
    await expect(page.getByRole("button", { name: /^(Workspace|工作区)$/ })).toBeVisible();

    await closeSettingsPage(page);
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .not.toBe("/settings");
  });
});
