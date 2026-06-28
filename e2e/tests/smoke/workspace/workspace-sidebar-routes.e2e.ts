import { expect, test } from "../../../fixtures/test";
import {
  buildProjectWorkspaceDeepLink,
  connectLocalComputer,
  expectHealthyRoute,
  getRightSidebar,
  gotoContextRoute,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../support/app-smoke";

test.describe("smoke workspace", () => {
  test("@smoke @stateful exercises workspace right sidebar tab routes and read-only subtabs", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await expectHealthyRoute(page, "zh", "");
    await expect(page.getByRole("button", { name: /搜索|Search/ })).toBeVisible({
      timeout: 45_000,
    });

    const contextUrl = withSearchParams(await buildProjectWorkspaceDeepLink(page, "zh"), {
      activeSettingTab: null,
    });

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "files" }));
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("files");

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "changes" }));
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab") ?? "changes")
      .toBe("changes");
    const changesSidebar = await getRightSidebar(page);
    await changesSidebar.getByRole("tab", { name: "提交" }).click();
    await expect(changesSidebar.getByRole("tab", { name: "提交" })).toBeVisible();

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "review" }));
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("review");

    await gotoContextRoute(
      page,
      withSearchParams(contextUrl, { rsTab: "run-preview", pvView: "desktop" }),
    );
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("pvView") ?? "desktop")
      .toBe("desktop");

    await gotoContextRoute(
      page,
      withSearchParams(contextUrl, { rsTab: "run-preview", pvView: "mobile" }),
    );
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("pvView"))
      .toBe("mobile");

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "pr" }));
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("pr");
    const prSidebar = await getRightSidebar(page);
    const closedPrTab = prSidebar.getByRole("tab", { name: "已关闭" });
    if (await closedPrTab.isVisible().catch(() => false)) {
      await closedPrTab.click();
      await expect(closedPrTab).toBeVisible();
    }

    await gotoContextRoute(page, withSearchParams(contextUrl, { rsTab: "actions" }));
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("rsTab"))
      .toBe("actions");
  });

  test("@smoke @stateful boots direct workspace urls with read-only sidebar toggles and settings modal", async ({
    page,
  }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const contextUrl = await buildProjectWorkspaceDeepLink(page, "zh");
    const workspaceUrl = new URL(contextUrl).searchParams.get("pvUrl");
    expect(workspaceUrl, "missing workspace url in project deep link").toBeTruthy();

    const projectsRoute = withSearchParams(workspaceUrl!, {
      lsTab: "projects",
      lsKanban: "true",
      settingsModal: null,
      activeSettingTab: null,
    });
    const firstResponse = await page.goto(projectsRoute, {
      waitUntil: "domcontentloaded",
    });
    expect(firstResponse, `missing navigation response for ${projectsRoute}`).not.toBeNull();
    expect(firstResponse!.status(), `unexpected status for ${projectsRoute}`).toBeLessThan(500);
    await expect
      .poll(async () => new URL(page.url()).pathname)
      .toBe("/zh/workspace");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("id") ?? "")
      .not.toBe("");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsTab"))
      .toBe("projects");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("lsKanban"))
      .toBe("true");
    await expect
      .poll(async () => page.locator("html").getAttribute("lang"))
      .toBe("zh");
    await expect(page.locator("body")).toBeVisible();

    const filesRoute = withSearchParams(workspaceUrl!, {
      lsTab: "files",
      lsKanban: null,
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
      .poll(async () => new URL(page.url()).searchParams.get("lsKanban") ?? "")
      .toBe("");

    const settingsRoute = withSearchParams(workspaceUrl!, {
      lsTab: "files",
      settingsModal: "true",
      activeSettingTab: "shortcuts",
    });
    const thirdResponse = await page.goto(settingsRoute, {
      waitUntil: "domcontentloaded",
    });
    expect(thirdResponse, `missing navigation response for ${settingsRoute}`).not.toBeNull();
    expect(thirdResponse!.status(), `unexpected status for ${settingsRoute}`).toBeLessThan(500);
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("settingsModal"))
      .toBe("true");
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe("shortcuts");

    const settingsDialog = page.getByRole("dialog");
    await expect(settingsDialog).toBeVisible();
    await settingsDialog.getByRole("button", { name: /close/i }).click();
    await expect(settingsDialog).toBeHidden();
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("settingsModal") ?? "false")
      .toBe("false");
  });
});
