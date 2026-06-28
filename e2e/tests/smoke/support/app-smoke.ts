import type { Page } from "@playwright/test";
import { apiPort } from "../../../fixtures/app-server";
import { expect } from "../../../fixtures/test";

export const locales = ["en", "zh"] as const;

export const routes = [
  "",
  "/setup",
  "/agents",
  "/automations",
  "/skills",
  "/terminals",
  "/workspaces",
] as const;

export async function expectHealthyRoute(
  page: Page,
  locale: (typeof locales)[number],
  route: (typeof routes)[number],
): Promise<void> {
  const response = await page.goto(`/${locale}${route}`, {
    waitUntil: "domcontentloaded",
  });

  expect(response, `missing navigation response for /${locale}${route}`).not.toBeNull();
  expect(response!.status(), `unexpected status for /${locale}${route}`).toBeLessThan(500);

  await expect
    .poll(async () => page.locator("html").getAttribute("lang"))
    .toBe(locale);

  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(500);
}

export async function openActionMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Open actions menu|···/ }).click();
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
}

export async function stubComputerClientSettingsApi(page: Page): Promise<void> {
  await page.route("**/api/system/computer-client-settings", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            path: "/tmp/atmos-e2e-computer-client.json",
            configured: false,
            access_token: "",
            relay_url: "wss://atmos.sh/relay",
            relay_secret_key: "",
            relay_secret_key_configured: false,
          },
        }),
      });
      return;
    }

    if (method === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.continue();
  });
}

export async function connectLocalComputer(page: Page): Promise<void> {
  await expectHealthyRoute(page, "en", "");

  const searchButton = page.getByRole("button", { name: /Search/ });
  const connectButton = page
    .locator("main")
    .first()
    .getByRole("button", { name: "Connect" });

  if (await searchButton.isVisible().catch(() => false)) {
    return;
  }

  await expect
    .poll(
      async () =>
        (await connectButton.isVisible().catch(() => false)) ||
        (await searchButton.isVisible().catch(() => false)),
      { timeout: 45_000 },
    )
    .toBe(true);

  if (await connectButton.isVisible().catch(() => false)) {
    await connectButton.click();
  }

  await expect(searchButton).toBeVisible({
    timeout: 45_000,
  });
}

export async function buildProjectWorkspaceDeepLink(
  page: Page,
  locale: (typeof locales)[number],
): Promise<string> {
  const origin = new URL(page.url()).origin;

  type ApiResponse<T> = { success: boolean; data: T };
  type ProjectRecord = { guid: string; main_file_path?: string | null };
  type WorkspaceRecord = { guid: string };

  const projectResponse = await fetch(`http://127.0.0.1:${apiPort}/api/project`);
  expect(projectResponse.ok, "failed to load projects for deep-link smoke").toBe(true);

  const projectPayload = (await projectResponse.json()) as ApiResponse<ProjectRecord[]>;
  expect(projectPayload.success, "project API returned unsuccessful response").toBe(true);

  const orderedProjects = [...projectPayload.data].sort((left, right) => {
    const leftPreferred = left.main_file_path?.endsWith("/OpenSource/atmos") ? 1 : 0;
    const rightPreferred = right.main_file_path?.endsWith("/OpenSource/atmos") ? 1 : 0;
    return rightPreferred - leftPreferred;
  });

  let targetProject: ProjectRecord | null = null;
  let targetWorkspace: WorkspaceRecord | null = null;

  for (const project of orderedProjects) {
    const workspaceResponse = await fetch(
      `http://127.0.0.1:${apiPort}/api/workspace/project/${project.guid}`,
    );
    if (!workspaceResponse.ok) continue;

    const workspacePayload = (await workspaceResponse.json()) as ApiResponse<WorkspaceRecord[]>;
    if (!workspacePayload.success || workspacePayload.data.length === 0) continue;

    targetProject = project;
    targetWorkspace = workspacePayload.data[0] ?? null;
    break;
  }

  expect(targetProject, "missing project with workspace for deep-link smoke").toBeTruthy();

  const targetUrl = new URL(`/${locale}/project`, origin);
  targetUrl.searchParams.set("id", targetProject!.guid);
  if (targetWorkspace?.guid) {
    targetUrl.searchParams.set(
      "pvUrl",
      `${origin}/${locale}/workspace?id=${targetWorkspace.guid}`,
    );
  }
  targetUrl.searchParams.set("activeSettingTab", "shortcuts");
  targetUrl.searchParams.set("lsTab", "files");
  return targetUrl.toString();
}

export function withSearchParams(
  baseUrl: string,
  params: Record<string, string | null | undefined>,
): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export async function getRightSidebar(page: Page) {
  const asides = page.locator("aside");
  await expect
    .poll(async () => asides.count(), {
      timeout: 45_000,
    })
    .toBeGreaterThan(0);
  const resolvedCount = await asides.count();
  expect(resolvedCount, "missing sidebars for context page").toBeGreaterThan(0);
  return asides.nth(resolvedCount - 1);
}

export async function gotoContextRoute(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
  });
  expect(response, `missing navigation response for ${url}`).not.toBeNull();
  expect(response!.status(), `unexpected status for ${url}`).toBeLessThan(500);
  await expect
    .poll(async () => page.locator("html").getAttribute("lang"))
    .toBe("zh");
  const rightSidebar = await getRightSidebar(page);
  await expect(rightSidebar).toBeVisible();
  await page.waitForTimeout(400);
}
