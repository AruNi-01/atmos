import { expect, test } from "../../../fixtures/test";
import {
  activateWorkspaceToolTab,
  buildProjectWorkspaceDeepLink,
  closeSettingsPage,
  connectLocalComputer,
  expectHealthyRoute,
  getCenterStage,
  gotoContextRoute,
  gotoSettingsRoute,
  normalizePathname,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../support/app-smoke";

test.describe("smoke workspace", () => {
  test("@smoke @stateful exercises workspace center tool tabs and read-only subtabs", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "zh" });

    await expectHealthyRoute(page, "/", { locale: "zh" });
    await expect(page.getByRole("button", { name: /搜索|Search/ })).toBeVisible({
      timeout: 45_000,
    });

    const contextUrl = withSearchParams(await buildProjectWorkspaceDeepLink(page), {
      activeSettingTab: null,
    });

    await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "files" }), {
      locale: "zh",
    });
    await expect(page.getByRole("tab", { name: /^(文件|Files)$/ })).toBeVisible({
      timeout: 45_000,
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBeNull();

    // Stay on this paint context: `?tab=` hops are leftover chrome after last-tab
    // files, and a full navigation remounts the strip. Open tools from plus.
    await activateWorkspaceToolTab(page, /变更|Changes/);
    const changesStage = await getCenterStage(page);
    const scopeTrigger = changesStage.getByRole("button", {
      name: /选择变更范围|Select changes scope/,
    });
    await expect(scopeTrigger).toBeVisible({ timeout: 45_000 });
    await scopeTrigger.click();
    await page.getByRole("menuitem", { name: /^(图形历史|Graph History)$/ }).click();
    // The tab's computed name can include the close control; do not require an exact match.
    await expect(page.getByRole("tab", { name: /图形历史|Graph History/ })).toBeVisible();

    await activateWorkspaceToolTab(page, /评审|Review/);

    await activateWorkspaceToolTab(page, /运行|Run/);
    const runStage = await getCenterStage(page);
    // The Run surface's inner terminal strip reuses the same 运行/Run tab name.
    await expect(
      runStage.getByRole("tablist").first().getByRole("tab", { name: /运行|Run/ }),
    ).toBeVisible({ timeout: 45_000 });

    await activateWorkspaceToolTab(page, /GitHub/);
    const githubStage = await getCenterStage(page);
    await expect(githubStage.getByRole("tab", { name: "拉取请求" })).toBeVisible();
    await expect(githubStage.getByRole("tab", { name: "议题" })).toBeVisible();
    await expect(githubStage.getByRole("tab", { name: "操作" })).toBeVisible();
  });

  test("@smoke @stateful boots direct workspace urls with read-only sidebar toggles and settings page", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "zh" });

    const contextUrl = await buildProjectWorkspaceDeepLink(page);
    const workspaceUrl = new URL(contextUrl).searchParams.get("pvUrl");
    expect(workspaceUrl, "missing workspace url in project deep link").toBeTruthy();

    const projectsRoute = withSearchParams(workspaceUrl!, {
      lsTab: "projects",
      lsTask: "true",
      settingsModal: null,
      activeSettingTab: null,
    });
    const firstResponse = await page.goto(projectsRoute, {
      waitUntil: "domcontentloaded",
    });
    expect(firstResponse, `missing navigation response for ${projectsRoute}`).not.toBeNull();
    expect(firstResponse!.status(), `unexpected status for ${projectsRoute}`).toBeLessThan(500);
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/workspace");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("id") ?? "")
      .not.toBe("");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsTab"))
      .toBe("projects");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsTask"))
      .toBe("true");
    await expect
      .poll(async () => page.locator("html").getAttribute("lang"))
      .toBe("zh");
    await expect(page.locator("body")).toBeVisible();

    const filesRoute = withSearchParams(workspaceUrl!, {
      tab: "files",
      lsTask: null,
      settingsModal: null,
      activeSettingTab: null,
    });
    const secondResponse = await page.goto(filesRoute, {
      waitUntil: "domcontentloaded",
    });
    expect(secondResponse, `missing navigation response for ${filesRoute}`).not.toBeNull();
    expect(secondResponse!.status(), `unexpected status for ${filesRoute}`).toBeLessThan(500);
    await expect(page.getByRole("tab", { name: /^(文件|Files)$/ })).toBeVisible({
      timeout: 45_000,
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsTask") ?? "")
      .toBe("");

    await gotoSettingsRoute(page, "keyboard", { locale: "zh" });
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/settings");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe("keyboard");
    await expect(page.getByRole("button", { name: /^(Keyboard|键盘)$/ })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);

    await closeSettingsPage(page);
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .not.toBe("/settings");
  });
});
