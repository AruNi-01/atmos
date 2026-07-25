import { expect, test } from "../../fixtures/test";
import { apiPort } from "../../fixtures/app-server";
import {
  connectLocalComputer,
  expectHealthyRoute,
  gotoContextRoute,
  stubComputerClientSettingsApi,
  withSearchParams,
  buildProjectWorkspaceDeepLink,
} from "../smoke/support/app-smoke";

async function wsRequestFromPage<T>(
  page: import("@playwright/test").Page,
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    async ({ port, actionName, payload }) => {
      return await new Promise<T>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?client_type=web`);
        let settled = false;
        const finish = (cb: (v: unknown) => void, value: unknown) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          try {
            socket.close();
          } catch {
            // ignore
          }
          cb(value);
        };
        const timeoutId = window.setTimeout(() => {
          finish((v) => reject(v as Error), new Error(`timeout ${actionName}`));
        }, 20_000);

        socket.addEventListener("open", () => {
          socket.send(
            JSON.stringify({
              type: "request",
              payload: { request_id: requestId, action: actionName, data: payload },
            }),
          );
        });
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            payload?: {
              request_id?: string;
              success?: boolean;
              data?: T;
              error?: { message?: string };
            };
          };
          if (message.type !== "response" && message.type !== "error") return;
          if (message.payload?.request_id !== requestId) return;
          if (message.type === "error" || message.payload?.success === false) {
            finish(
              (v) => reject(v as Error),
              new Error(message.payload?.error?.message ?? `failed ${actionName}`),
            );
            return;
          }
          finish((v) => resolve(v as T), message.payload?.data as T);
        });
        socket.addEventListener("error", () => {
          finish((v) => reject(v as Error), new Error(`socket error ${actionName}`));
        });
      });
    },
    { port: apiPort, actionName: action, payload: data },
  );
}

/**
 * APP-044: Project / Workspace Groups
 *
 * Creates a group via WS, attaches a project member, and asserts bootstrap returns groups.
 * Also soft-checks that the By Group sidebar mode is available after reload.
 */
test.describe("APP-044 project workspace groups", () => {
  test("@spec @stateful group CRUD and bootstrap membership", async ({ page }) => {
    test.setTimeout(120_000);

    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "en" });
    await expectHealthyRoute(page, "/", { locale: "en" });

    const contextUrl = await buildProjectWorkspaceDeepLink(page);
    const projectId = new URL(contextUrl, "http://localhost").searchParams.get("id");
    expect(projectId).toBeTruthy();

    const group = await wsRequestFromPage<{
      guid: string;
      name: string;
      members: unknown[];
    }>(page, "group_create", { name: "E2E Client Group" });
    expect(group.name).toBe("E2E Client Group");
    expect(group.guid).toBeTruthy();

    try {
      const member = await wsRequestFromPage<{
        guid: string;
        member_type: string;
        member_guid: string;
      }>(page, "group_set_member", {
        group_guid: group.guid,
        member_type: "project",
        member_guid: projectId,
      });
      expect(member.member_type).toBe("project");
      expect(member.member_guid).toBe(projectId);

      const bootstrap = await wsRequestFromPage<{
        groups?: Array<{ guid: string; name: string; members: Array<{ member_guid: string }> }>;
      }>(page, "project_workspace_bootstrap");
      const found = (bootstrap.groups ?? []).find((g) => g.guid === group.guid);
      expect(found?.name).toBe("E2E Client Group");
      expect(found?.members.some((m) => m.member_guid === projectId)).toBe(true);

      // Switch UI to By Group when possible.
      await gotoContextRoute(
        page,
        withSearchParams(contextUrl, {
          lsTab: "projects",
          activeSettingTab: null,
        }),
      );

      // Grouping control lives in the sidebar footer; best-effort UI smoke.
      // Residual gap: no stable data-testid on the grouping mode control yet;
      // keep soft checks to avoid flake on green CI.
      const groupByControl = page.locator("aside").getByText(/group by|by project/i).first();
      if (await groupByControl.isVisible().catch(() => false)) {
        await groupByControl.click();
        const byGroupOption = page.getByText("By Group", { exact: true });
        if (await byGroupOption.isVisible().catch(() => false)) {
          await byGroupOption.click();
          await expect(page.getByText("E2E Client Group").first()).toBeVisible({
            timeout: 15_000,
          });
        }
      }
    } finally {
      // Cleanup even if assertions fail so later runs stay isolated.
      try {
        await wsRequestFromPage(page, "group_delete", { guid: group.guid });
      } catch {
        // Group may already be gone or WS may have closed — ignore cleanup errors.
      }
    }

    const after = await wsRequestFromPage<{
      groups?: Array<{ guid: string }>;
    }>(page, "project_workspace_bootstrap");
    expect((after.groups ?? []).some((g) => g.guid === group.guid)).toBe(false);
  });
});
