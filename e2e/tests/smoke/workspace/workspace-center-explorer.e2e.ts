import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../../../fixtures/test";
import { repoRoot } from "../../../fixtures/app-server";
import {
  activateWorkspaceToolTab,
  buildProjectWorkspaceDeepLink,
  connectLocalComputer,
  getCenterStage,
  gotoContextRoute,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../support/app-smoke";
import { unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const ARTIFACTS_DIR = "/opt/cursor/artifacts";
const CHANGE_SEED_RELATIVE = ".e2e-center-explorer-change.txt";
const CHANGE_SEED_PATH = path.join(repoRoot, CHANGE_SEED_RELATIVE);

function seedWorkingTreeChange() {
  writeFileSync(CHANGE_SEED_PATH, "e2e-center-explorer-change\n");
}

function clearWorkingTreeChange() {
  try {
    unlinkSync(CHANGE_SEED_PATH);
  } catch {
    // already gone
  }
}

async function expectSidecarOnRight(
  page: Page,
  kind: "files" | "changes",
) {
  const sidecar = page.locator(`[data-center-explorer="${kind}"]`);
  const landing = page.locator(`[data-center-explorer-landing="${kind}"]`);
  const toggle = landing.locator(`[data-center-explorer-toggle="${kind}"]`);
  if ((await sidecar.getAttribute("data-center-explorer-open")) !== "true") {
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click({ timeout: 5_000 }).catch(() => undefined);
    }
  }
  await expect(sidecar).toHaveAttribute("data-center-explorer-open", "true", {
    timeout: 45_000,
  });
  const stage = await getCenterStage(page);
  const sidecarBox = await sidecar.boundingBox();
  const stageBox = await stage.boundingBox();
  expect(sidecarBox, `${kind} sidecar box`).toBeTruthy();
  expect(stageBox, "center stage box").toBeTruthy();
  const side = sidecarBox!;
  const host = stageBox!;
  expect(side.width).toBeGreaterThan(120);
  expect(side.x).toBeGreaterThan(host.x + host.width * 0.45);
  expect(side.x + side.width).toBeGreaterThan(host.x + host.width - 24);

  const chrome = page
    .locator("[data-center-explorer-chrome]")
    .filter({ visible: true })
    .first();
  await expect(chrome).toBeVisible({ timeout: 10_000 });
  const chromeBox = await chrome.boundingBox();
  expect(chromeBox, `${kind} chrome box`).toBeTruthy();
  const bar = chromeBox!;
  expect(bar.x + bar.width).toBeGreaterThan(host.x + host.width - 24);
  expect(side.y).toBeGreaterThanOrEqual(bar.y + bar.height - 2);
}

async function resizeSidecar(
  page: Page,
  kind: "files" | "changes",
  deltaX: number,
) {
  const sidecar = page.locator(`[data-center-explorer="${kind}"]`);
  const box = await sidecar.boundingBox();
  expect(box, `${kind} sidecar box before resize`).toBeTruthy();
  const before = box!;
  const handle = sidecar.locator("[data-center-explorer-resize]");
  const handleBox = await handle.boundingBox();
  const grab = handleBox ?? before;
  const y = grab.y + Math.min(48, Math.max(8, grab.height / 2));
  await page.mouse.move(grab.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 1 + deltaX, y, { steps: 8 });
  await page.mouse.up();
  const next = await sidecar.boundingBox();
  expect(next, `${kind} sidecar box after resize`).toBeTruthy();
  return { before, after: next! };
}

function explorerToggleBeside(control: Locator, kind: "files" | "changes") {
  return control.locator(
    `xpath=following::button[@data-center-explorer-toggle="${kind}"][1]`,
  );
}

async function expectToggleRightOf(control: Locator, toggle: Locator) {
  await expect(control).toBeVisible({ timeout: 20_000 });
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  const controlBox = await control.boundingBox();
  const toggleBox = await toggle.boundingBox();
  expect(controlBox).toBeTruthy();
  expect(toggleBox).toBeTruthy();
  expect(toggleBox!.x).toBeGreaterThan(controlBox!.x);
  expect(Math.abs(toggleBox!.y - controlBox!.y)).toBeLessThan(16);
}

async function stubExplorerNoiseRoutes(page: Page) {
  await page.route("**/agent-status/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
  await page.route("**/api/canvas/documents/**", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: "{\"error\":\"missing\"}",
    });
  });
}

test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: "on", size: { width: 1440, height: 900 } },
  screenshot: "on",
});

test.describe("smoke workspace center explorer", () => {
  test.afterAll(() => {
    clearWorkingTreeChange();
  });

  test(
    "@smoke @stateful docks files and changes as a shared right sidecar",
    { timeout: 180_000 },
    async ({ page }) => {
    seedWorkingTreeChange();
    await stubComputerClientSettingsApi(page);
    await stubExplorerNoiseRoutes(page);
    await connectLocalComputer(page, { locale: "en" });

    const contextUrl = withSearchParams(await buildProjectWorkspaceDeepLink(page), {
      activeSettingTab: null,
    });
    await gotoContextRoute(page, withSearchParams(contextUrl, { tab: "files" }), {
      locale: "en",
    });

    await expect(page.getByRole("tab", { name: /^(Files|文件)$/ })).toBeVisible({
      timeout: 45_000,
    });
    await page.getByRole("tab", { name: /^(Files|文件)$/ }).click();
    await expect
      .poll(async () => page.getByRole("tab", { name: /^(Files|文件)$/ }).getAttribute("aria-selected"))
      .toBe("true");
    const filesLanding = page.locator('[data-center-explorer-landing="files"]');
    await expect(filesLanding.locator("[data-center-explorer-search]")).toBeVisible({
      timeout: 20_000,
    });
    await expect(filesLanding.getByRole("button", { name: /New File|新建文件/ })).toBeVisible();
    await expectSidecarOnRight(page, "files");

    const resized = await resizeSidecar(page, "files", -80);
    expect(resized.after.width).toBeGreaterThan(resized.before.width + 40);
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/files_sidecar_resized.png`,
    });
    await resizeSidecar(page, "files", 80);

    const search = filesLanding.locator("[data-center-explorer-search]");
    await search.fill(".agents");
    await expect(
      filesLanding.getByRole("button", { name: ".agents", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/files_sidecar_landing.png`,
    });
    await search.fill("");
    await expect(filesLanding.getByRole("button", { name: /New File|新建文件/ })).toBeVisible();

    const filesSidecar = page.locator('[data-center-explorer="files"]');
    await expect(filesSidecar).toHaveCount(1);

    const appsFolder = filesSidecar.getByText("apps", { exact: true }).first();
    await expect(appsFolder).toBeVisible({ timeout: 30_000 });
    await appsFolder.click();
    await expect(filesSidecar.getByText("web", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const agentsFile = filesSidecar.getByText("AGENTS.md", { exact: true }).first();
    await expect(agentsFile).toBeVisible({ timeout: 20_000 });
    await agentsFile.dblclick();
    await expect(page.getByRole("tab", { name: /AGENTS\.md/ })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("tab", { name: /^(Files|文件)$/ }).click();
    await expect(filesLanding.locator("[data-center-explorer-search]")).toBeVisible({
      timeout: 15_000,
    });
    await expect(filesLanding.getByText(/Recents|最近打开/)).toBeVisible();
    await expect(
      filesLanding.locator('[data-center-explorer-row="recent-file"]').filter({
        hasText: "AGENTS.md",
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/files_landing_recents.png`,
    });

    await page.getByRole("tab", { name: /AGENTS\.md/ }).click();

    const editorSettings = page.getByRole("button", {
      name: /Open editor settings|打开编辑器设置/,
    });
    const filesToggle = explorerToggleBeside(editorSettings, "files");
    await expectToggleRightOf(editorSettings, filesToggle);
    await expectSidecarOnRight(page, "files");
    await expect(filesSidecar.getByText("web", { exact: true }).first()).toBeVisible();
    const markdownToc = page.locator('[data-markdown-toc-side="left"]');
    await expect(markdownToc).toBeVisible({ timeout: 20_000 });
    const tocBox = await markdownToc.boundingBox();
    const sidecarForToc = await filesSidecar.boundingBox();
    expect(tocBox, "markdown outline box").toBeTruthy();
    expect(sidecarForToc, "files sidecar box beside markdown").toBeTruthy();
    expect(tocBox!.x + tocBox!.width).toBeLessThan(sidecarForToc!.x);
    const activeFileRow = filesSidecar.locator(
      '[data-file-tree-row$="/apps/AGENTS.md"]',
    );
    await expect(activeFileRow).toBeVisible();
    const activeRowBox = await activeFileRow.boundingBox();
    expect(activeRowBox, "active files tree row").toBeTruthy();
    expect(activeRowBox!.x).toBeGreaterThan(sidecarForToc!.x + 6);
    expect(activeRowBox!.x + activeRowBox!.width).toBeLessThan(
      sidecarForToc!.x + sidecarForToc!.width - 6,
    );
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/files_sidecar_editor.png`,
    });
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/files_tree_row_inset.png`,
    });
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/markdown_preview_toc_left.png`,
    });

    const packageJson = filesSidecar.getByText("package.json", { exact: true }).first();
    await expect(packageJson).toBeVisible();
    await packageJson.dblclick();
    await expect(page.getByRole("tab", { name: /package\.json/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(filesSidecar).toHaveCount(1);
    await expect(filesSidecar).toHaveAttribute("data-center-explorer-open", "true");
    await expect(filesSidecar.getByText("web", { exact: true }).first()).toBeVisible();

    await filesToggle.click();
    await expect(filesSidecar).toHaveAttribute("data-center-explorer-open", "false");
    const collapsedBox = await filesSidecar.boundingBox();
    expect(collapsedBox?.width ?? 0).toBeLessThan(8);
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/files_sidecar_collapsed.png`,
    });
    await filesToggle.click();
    await expect(filesSidecar).toHaveAttribute("data-center-explorer-open", "true");
    await expectSidecarOnRight(page, "files");

    await activateWorkspaceToolTab(page, /^(Changes|变更)$/);
    const changesLanding = page.locator('[data-center-explorer-landing="changes"]');
    await expect(
      changesLanding.locator('[data-center-explorer-row="graph-history"]'),
    ).toBeVisible({ timeout: 20_000 });
    await expect(changesLanding.locator("[data-center-explorer-search]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Select changes scope|选择变更范围/ }),
    ).toBeVisible({ timeout: 45_000 });
    await expectSidecarOnRight(page, "changes");
    await expect(
      changesLanding.locator('[data-center-explorer-row="recent-commit"]').first(),
    ).toBeVisible({ timeout: 45_000 });
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/changes_sidecar_landing.png`,
    });

    await changesLanding.locator('[data-center-explorer-row="recent-commit"]').first().click();
    await expect(page.getByRole("tab", { name: /Graph History|图形历史/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/changes_landing_commit.png`,
    });

    await activateWorkspaceToolTab(page, /^(Changes|变更)$/);

    const changesSidecar = page.locator('[data-center-explorer="changes"]');
    await expect(changesSidecar).toHaveCount(1);
    const changeFile = changesSidecar.getByText(CHANGE_SEED_RELATIVE, { exact: true });
    await expect(changeFile).toBeVisible({ timeout: 45_000 });
    await changeFile.click();

    const diffSettings = page.getByTitle(/View options|视图选项/).first();
    const changesToggle = explorerToggleBeside(diffSettings, "changes");
    await expectToggleRightOf(diffSettings, changesToggle);
    await expectSidecarOnRight(page, "changes");
    await page.screenshot({
      path: `${ARTIFACTS_DIR}/changes_sidecar_diff.png`,
    });

    await expect(changesSidecar).toHaveCount(1);
    await changeFile.click();
    await expect(changesSidecar).toHaveCount(1);
    await expect(changesSidecar).toHaveAttribute("data-center-explorer-open", "true");
  });
});
