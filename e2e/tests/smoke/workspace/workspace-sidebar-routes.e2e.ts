import { expect, test } from "../../../fixtures/test";
import {
  buildProjectWorkspaceDeepLink,
  closeSettingsPage,
  connectLocalComputer,
  expectHealthyRoute,
  getRightSidebar,
  gotoContextRoute,
  gotoSettingsRoute,
  normalizePathname,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../support/app-smoke";

test.describe("smoke workspace", () => {
  test("@smoke @stateful exercises workspace right sidebar tab routes and read-only subtabs", async ({
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

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "files" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("files");

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "changes" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab") ?? "changes")
      .toBe("changes");
    const changesSidebar = await getRightSidebar(page);
    const filesDiffTab = changesSidebar.getByRole("tab", { name: "文件对比" });
    await expect(filesDiffTab).toBeVisible();
    await filesDiffTab.hover();
    const scopeTrigger = changesSidebar.getByRole("button", { name: "选择变更范围" });
    await expect(scopeTrigger).toBeVisible();
    await scopeTrigger.click();
    await page.getByRole("menuitem", { name: "历史记录" }).click();
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBe("git-history");
    await expect(page.getByRole("tab", { name: "历史记录" })).toBeVisible();

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "review" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("review");

    await gotoContextRoute(
      page,
      withSearchParams(contextUrl, { rsTab: "browser", pvView: "desktop" }),
      { locale: "zh" },
    );
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("browser");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("pvView") ?? "desktop")
      .toBe("desktop");

    await gotoContextRoute(
      page,
      withSearchParams(contextUrl, { rsTab: "browser", pvView: "mobile" }),
      { locale: "zh" },
    );
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("pvView"))
      .toBe("mobile");

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "run" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("run");

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "github" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("github");
    const githubSidebar = await getRightSidebar(page);
    await expect(githubSidebar.getByRole("tab", { name: "拉取请求" })).toBeVisible();
    await expect(githubSidebar.getByRole("tab", { name: "议题" })).toBeVisible();
    await expect(githubSidebar.getByRole("tab", { name: "操作" })).toBeVisible();
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
      lsTab: "files",
      lsTask: null,
      settingsModal: null,
      activeSettingTab: null,
    });
    const secondResponse = await page.goto(filesRoute, {
      waitUntil: "domcontentloaded",
    });
    expect(secondResponse, `missing navigation response for ${filesRoute}`).not.toBeNull();
    expect(secondResponse!.status(), `unexpected status for ${filesRoute}`).toBeLessThan(500);
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsTab"))
      .toBe("files");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsTask") ?? "")
      .toBe("");

    await gotoSettingsRoute(page, "shortcuts", { locale: "zh" });
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .toBe("/settings");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe("shortcuts");
    await expect(page.getByRole("heading", { name: /^(Shortcuts|快捷键)$/ })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /^(Settings|设置)$/ })).toHaveCount(0);

    await closeSettingsPage(page);
    await expect
      .poll(async () => normalizePathname(new URL(page.url()).pathname))
      .not.toBe("/settings");
  });
});
