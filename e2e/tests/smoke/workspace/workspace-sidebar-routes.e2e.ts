import { expect, test } from "../../../fixtures/test";
import {
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
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBe("files");

    await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "changes" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab") ?? "changes")
      .toBe("changes");
    const changesStage = await getCenterStage(page);
    const scopeTrigger = changesStage.getByRole("button", {
      name: /选择变更范围|Select changes scope/,
    });
    await expect(scopeTrigger).toBeVisible();
    await scopeTrigger.click();
    await page.getByRole("menuitem", { name: /^(图形历史|Graph History)$/ }).click();
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBe("git-history");
    // The tab's computed name can include the close control; do not require an exact match.
    await expect(page.getByRole("tab", { name: /图形历史|Graph History/ })).toBeVisible();

    await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "review" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBe("review");

    await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "run" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBe("run");

    await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "github" }), {
      locale: "zh",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
      .toBe("github");
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
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("tab"))
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
