import type { Page } from "@playwright/test";
import { apiPort, repoRoot } from "../../../fixtures/app-server";
import { expect } from "../../../fixtures/test";

/** Runtime workbench locales (APP-028). Not URL prefixes. */
export const locales = ["en", "zh"] as const;
export type WorkbenchLocale = (typeof locales)[number];

const WORKBENCH_LOCALE_STORAGE_KEY = "atmos:v1:global:locale";
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

  await page.route("**/v1/tenants**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
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
      type ApiResponse<T> = { success: boolean; data: T };

      const apiBase = `http://127.0.0.1:${apiPort}`;

      async function parseApiResponse<T>(response: Response, message: string): Promise<ApiResponse<T>> {
        if (!response.ok) {
          throw new Error(`${message}: ${response.status}`);
        }
        return (await response.json()) as ApiResponse<T>;
      }

      async function listProjects(): Promise<ProjectRecord[]> {
        const payload = await parseApiResponse<ProjectRecord[]>(
          await fetch(`${apiBase}/api/project`),
          "failed to load projects for deep-link smoke",
        );
        if (!payload.success) {
          throw new Error("project API returned unsuccessful response");
        }
        return payload.data;
      }

      async function listWorkspaces(projectGuid: string): Promise<WorkspaceRecord[]> {
        const response = await fetch(`${apiBase}/api/workspace/project/${projectGuid}`);
        if (!response.ok) return [];
        const payload = (await response.json()) as ApiResponse<WorkspaceRecord[]>;
        return payload.success ? payload.data : [];
      }

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
        const createPayload = await parseApiResponse<ProjectRecord>(
          await fetch(`${apiBase}/api/project`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              name: "Atmos E2E",
              main_file_path: createProjectPath,
              sidebar_order: 0,
              border_color: null,
            }),
          }),
          "failed to create project for deep-link smoke",
        );
        if (!createPayload.success) {
          throw new Error("project create API returned unsuccessful response");
        }
        targetProject = createPayload.data;
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
