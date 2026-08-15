import type { Page } from "@playwright/test";
import { apiPort, repoRoot } from "../../../fixtures/app-server";
import { expect } from "../../../fixtures/test";

/** Runtime workbench locales (APP-028). Not URL prefixes. */
export const locales = ["en", "zh"] as const;
export type WorkbenchLocale = (typeof locales)[number];

const WORKBENCH_LOCALE_STORAGE_KEY = "atmos:v1:global:locale";
const ONBOARDING_DONE_STORAGE_KEY = "atmos_onboarding_done";
const configuredSeedProjectPath = process.env.E2E_SEED_PROJECT_PATH?.trim();

type ProjectRecord = { guid: string; main_file_path?: string | null; name?: string | null };
type WorkspaceRecord = { guid: string; is_archived?: boolean | null };
type SmokeProjectSeed = { projectGuid: string; workspaceGuid: string };

/** Unprefixed workbench routes after APP-028 removed `[locale]` segments. */
export const routes = [
  "/",
  "/setup",
  "/agents",
  "/automations",
  "/skills",
  "/terminals",
  "/workspaces",
] as const;

export function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

let smokeProjectSeed: Promise<SmokeProjectSeed> | null = null;

/**
 * Skip APP-038 first-run onboarding so smoke can reach the IDE shell.
 * Dedicated onboarding coverage lives under `/onboarding` and APP-038 TEST.md.
 */
export async function seedOnboardingComplete(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Ignore quota / private-mode failures in smoke.
      }
    },
    { key: ONBOARDING_DONE_STORAGE_KEY, value: "true" },
  );
}

/**
 * Seed runtime locale before the first document load (APP-028).
 * Workbench language is localStorage-backed, not `/zh/...` routes.
 */
export async function seedWorkbenchLocale(
  page: Page,
  locale: WorkbenchLocale,
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Ignore quota / private-mode failures in smoke.
      }
    },
    { key: WORKBENCH_LOCALE_STORAGE_KEY, value: locale },
  );
}

export async function expectHealthyRoute(
  page: Page,
  route: (typeof routes)[number],
  options?: { locale?: WorkbenchLocale },
): Promise<void> {
  const expectedLocale = options?.locale ?? "en";
  // Always seed before navigation so a prior zh preference cannot leak into
  // default-en route boots (APP-028 persists locale in localStorage).
  await seedOnboardingComplete(page);
  await seedWorkbenchLocale(page, expectedLocale);

  const response = await page.goto(route, {
    waitUntil: "domcontentloaded",
  });

  expect(response, `missing navigation response for ${route}`).not.toBeNull();
  expect(response!.status(), `unexpected status for ${route}`).toBeLessThan(500);

  await expect(page.locator("body")).toBeVisible();
  await expect
    .poll(async () => page.locator("html").getAttribute("lang"), {
      timeout: 30_000,
    })
    .toBe(expectedLocale);

  await page.waitForTimeout(500);
}

export async function openActionMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Open actions menu|···/ }).click();
}

export async function openSettingsPage(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Open settings|打开设置/ }).click();
  await expect
    .poll(async () => normalizePathname(new URL(page.url()).pathname))
    .toBe("/settings");
}

export async function closeSettingsPage(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Close settings|关闭设置|^Back$|^返回$/ })
    .click();
  await expect
    .poll(async () => normalizePathname(new URL(page.url()).pathname))
    .not.toBe("/settings");
}

export async function gotoSettingsRoute(
  page: Page,
  tab?: string,
  options?: { locale?: WorkbenchLocale },
): Promise<void> {
  const expectedLocale = options?.locale ?? "en";
  await seedOnboardingComplete(page);
  await seedWorkbenchLocale(page, expectedLocale);
  const href = tab ? `/settings?activeSettingTab=${tab}` : "/settings";
  const response = await page.goto(href, {
    waitUntil: "domcontentloaded",
  });
  expect(response, `missing navigation response for ${href}`).not.toBeNull();
  expect(response!.status(), `unexpected status for ${href}`).toBeLessThan(500);
  await expect
    .poll(async () => page.locator("html").getAttribute("lang"))
    .toBe(expectedLocale);
  await expect
    .poll(async () => normalizePathname(new URL(page.url()).pathname))
    .toBe("/settings");
  if (tab) {
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("activeSettingTab"))
      .toBe(tab);
  }
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
            device_credential: "",
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

/** Keep setup/onboarding smoke offline from the public relay. */
export async function stubOnboardingRelayNetwork(page: Page): Promise<void> {
  await stubComputerClientSettingsApi(page);

  await page.route("**/api/system/computer/relay", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { status: 201, body: JSON.stringify({ ok: true }) },
      }),
    });
  });

  // APP-056: Relay no longer exposes /v1/tenants; device credentials are Hub-minted.
  await page.route("**/v1/computers**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ computers: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

export async function connectLocalComputer(
  page: Page,
  options?: { locale?: WorkbenchLocale },
): Promise<void> {
  const locale = options?.locale ?? "en";
  await seedOnboardingComplete(page);
  if (locale !== "en") {
    await seedWorkbenchLocale(page, locale);
  }
  await expectHealthyRoute(page, "/", { locale });

  const searchButton = page.getByRole("button", {
    name: locale === "zh" ? /搜索|Search/ : /Search/,
  });
  const connectButton = page
    .locator("main")
    .first()
    .getByRole("button", { name: locale === "zh" ? /连接|Connect/ : "Connect" });

  if (await searchButton.isVisible().catch(() => false)) {
    await ensureProjectWorkspaceSeed(page);
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
  await ensureProjectWorkspaceSeed(page);
}

export async function buildProjectWorkspaceDeepLink(page: Page): Promise<string> {
  const origin = new URL(page.url()).origin;
  const target = await ensureProjectWorkspaceSeed(page);

  const targetUrl = new URL(`/project`, origin);
  targetUrl.searchParams.set("id", target.projectGuid);
  targetUrl.searchParams.set("pvUrl", `${origin}/workspace?id=${target.workspaceGuid}`);
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

export async function gotoContextRoute(
  page: Page,
  url: string,
  options?: { locale?: WorkbenchLocale },
): Promise<void> {
  const expectedLocale = options?.locale ?? "en";
  await seedOnboardingComplete(page);
  await seedWorkbenchLocale(page, expectedLocale);
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
  });
  expect(response, `missing navigation response for ${url}`).not.toBeNull();
  expect(response!.status(), `unexpected status for ${url}`).toBeLessThan(500);
  await expect
    .poll(async () => page.locator("html").getAttribute("lang"))
    .toBe(expectedLocale);
  const rightSidebar = await getRightSidebar(page);
  await expect(rightSidebar).toBeVisible();
  await page.waitForTimeout(400);
}

async function ensureProjectWorkspaceSeed(page: Page): Promise<SmokeProjectSeed> {
  if (!smokeProjectSeed) {
    smokeProjectSeed = createProjectWorkspaceSeedData(page);
  }

  try {
    return await smokeProjectSeed;
  } catch (error) {
    smokeProjectSeed = null;
    throw error;
  }
}

function createProjectWorkspaceSeedData(page: Page): Promise<SmokeProjectSeed> {
  return page.evaluate(
    async ({ apiPort, repoRoot, seedProjectPath }) => {
      async function wsRequest<T>(action: string, data: unknown): Promise<T> {
        return await new Promise<T>((resolve, reject) => {
          const requestId = crypto.randomUUID();
          const socket = new WebSocket(`ws://127.0.0.1:${apiPort}/ws?client_type=web`);
          let settled = false;

          const finish = (callback: (value: T | Error) => void, value: T | Error) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            socket.close();
            callback(value);
          };

          const timeoutId = window.setTimeout(() => {
            finish((value) => reject(value as Error), new Error(`WebSocket timeout for ${action}`));
          }, 60_000);

          socket.addEventListener("open", () => {
            socket.send(
              JSON.stringify({
                type: "request",
                payload: {
                  request_id: requestId,
                  action,
                  data,
                },
              }),
            );
          });

          socket.addEventListener("message", (event) => {
            const message = JSON.parse(String(event.data)) as
              | { type: "response"; payload?: { request_id?: string; success?: boolean; data?: T } }
              | { type: "error"; payload?: { request_id?: string; message?: string } };

            if (message.payload?.request_id !== requestId) return;

            if (message.type === "response" && message.payload?.success) {
              finish((value) => resolve(value as T), message.payload.data as T);
              return;
            }

            const errorMessage =
              message.type === "error"
                ? (message.payload?.message ?? `WebSocket error for ${action}`)
                : `WebSocket request failed for ${action}`;
            finish((value) => reject(value as Error), new Error(errorMessage));
          });

          socket.addEventListener("error", () => {
            finish((value) => reject(value as Error), new Error(`WebSocket transport error for ${action}`));
          });
        });
      }

      async function listProjects(): Promise<ProjectRecord[]> {
        return await wsRequest<ProjectRecord[]>("project_list", {});
      }

      async function listWorkspaces(projectGuid: string): Promise<WorkspaceRecord[]> {
        try {
          return await wsRequest<WorkspaceRecord[]>("workspace_list", {
            project_guid: projectGuid,
          });
        } catch {
          return [];
        }
      }

      let projects = await listProjects();
      const candidateProjectPaths = [seedProjectPath, repoRoot].filter(
        (value): value is string => Boolean(value),
      );
      let targetProject =
        projects.find((project) =>
          candidateProjectPaths.some(
            (candidate) =>
              candidate && (project.main_file_path === candidate || project.main_file_path?.endsWith(candidate)),
          ),
        ) ??
        projects[0] ??
        null;

      if (!targetProject) {
        const createProjectPath = candidateProjectPaths[0] ?? repoRoot;
        targetProject = await wsRequest<ProjectRecord>("project_create", {
          name: "Atmos E2E",
          main_file_path: createProjectPath,
          sidebar_order: 0,
          border_color: null,
        });
      }

      let workspaces = await listWorkspaces(targetProject.guid);
      let targetWorkspace =
        workspaces.find((workspace) => !workspace.is_archived) ??
        workspaces[0] ??
        null;

      if (!targetWorkspace) {
        await wsRequest("workspace_create", {
          project_guid: targetProject.guid,
          name: "",
          display_name: null,
          branch: "",
          base_branch: null,
          sidebar_order: 0,
          initial_requirement: null,
          github_issue: null,
          github_pr: null,
          auto_extract_todos: false,
          priority: "no_priority",
          workflow_status: "in_progress",
          label_guids: null,
          attachments: [],
        });
        workspaces = await listWorkspaces(targetProject.guid);
        targetWorkspace =
          workspaces.find((workspace) => !workspace.is_archived) ??
          workspaces[0] ??
          null;
      }

      if (!targetProject || !targetWorkspace) {
        throw new Error("missing project with workspace for deep-link smoke");
      }

      return {
        projectGuid: targetProject.guid,
        workspaceGuid: targetWorkspace.guid,
      };
    },
    { apiPort, repoRoot, seedProjectPath: configuredSeedProjectPath },
  );
}
