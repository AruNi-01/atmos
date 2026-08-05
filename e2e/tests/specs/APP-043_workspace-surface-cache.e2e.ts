import { expect, test } from "../../fixtures/test";
import { apiPort } from "../../fixtures/app-server";
import {
  connectLocalComputer,
  expectHealthyRoute,
  gotoContextRoute,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../smoke/support/app-smoke";

/**
 * Soft client navigation — full page.goto resets Zustand warm cache (SPA memory).
 */
async function softOpenWorkspace(page: import("@playwright/test").Page, workspaceId: string) {
  // Client-side only: full page.goto resets Zustand warm cache.
  // local-web static export normalizes to `/workspace/?id=...` (trailing slash).
  await expect
    .poll(async () => page.evaluate(() => typeof window.__atmosNavigate === "function"), {
      timeout: 30_000,
    })
    .toBe(true);

  await page.evaluate((id) => {
    const href = `/workspace/?id=${encodeURIComponent(id)}&tab=terminal`;
    window.__atmosNavigate!(href);
  }, workspaceId);

  await expect
    .poll(async () => new URL(page.url()).searchParams.get("id"), { timeout: 30_000 })
    .toBe(workspaceId);
}

/**
 * APP-043: warm multi-context center frames.
 * Asserts data-workspace-frame warm/active continuity when switching workspaces
 * via client navigation (not full reload). Warm frames stay mounted with
 * data-tier visibility (not HTML hidden) so terminal WebGL is preserved.
 */
test.describe("APP-043 workspace surface cache", () => {
  test("@stateful keeps prior workspace frame warm when switching contexts", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "en" });
    await expectHealthyRoute(page, "/", { locale: "en" });

    const pair = await page.evaluate(async (port) => {
      async function wsRequest<T>(action: string, data: unknown): Promise<T> {
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
            finish((v) => reject(v as Error), new Error(`timeout ${action}`));
          }, 20_000);

          socket.addEventListener("open", () => {
            socket.send(
              JSON.stringify({
                type: "request",
                payload: { request_id: requestId, action, data },
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
                message?: string;
              };
            };
            if (message.payload?.request_id !== requestId) return;
            if (message.type === "response" && message.payload?.success) {
              finish((v) => resolve(v as T), message.payload.data as T);
              return;
            }
            finish(
              (v) => reject(v as Error),
              new Error(message.payload?.message ?? `failed ${action}`),
            );
          });
          socket.addEventListener("error", () => {
            finish((v) => reject(v as Error), new Error(`ws error ${action}`));
          });
        });
      }

      const projects = await wsRequest<Array<{ guid: string }>>("project_list", {});
      const project = projects[0];
      if (!project) throw new Error("no project for APP-043 e2e");

      let workspaces = await wsRequest<
        Array<{ guid: string; is_archived?: boolean | null; display_name?: string | null }>
      >("workspace_list", {
        project_guid: project.guid,
        include_issue_only: false,
      });

      let first = workspaces.find((w) => !w.is_archived) ?? workspaces[0] ?? null;
      if (!first) throw new Error("no workspace A");

      let second =
        workspaces.find((w) => w.guid !== first!.guid && !w.is_archived) ?? null;
      if (!second) {
        const stamp = Date.now().toString(36);
        const branch = `e2e/app043-warm-b-${stamp}`;
        await wsRequest("workspace_create", {
          project_guid: project.guid,
          name: branch,
          display_name: `APP-043 Warm B ${stamp}`,
          branch,
          base_branch: null,
          sidebar_order: 1,
          initial_requirement: null,
          github_issue: null,
          github_pr: null,
          auto_extract_todos: false,
          priority: "no_priority",
          workflow_status: "in_progress",
          label_guids: null,
          attachments: [],
        });
        workspaces = await wsRequest("workspace_list", {
          project_guid: project.guid,
          include_issue_only: false,
        });
        second =
          workspaces.find((w) => w.guid !== first!.guid && !w.is_archived) ?? null;
      }
      if (!second) throw new Error("no workspace B");
      return { a: first.guid, b: second.guid };
    }, apiPort);

    expect(pair.a).not.toBe(pair.b);

    const origin = new URL(page.url()).origin;
    // Initial load of A may use full navigation (cold start).
    await gotoContextRoute(
      page,
      withSearchParams(`${origin}/workspace?id=${pair.a}`, { tab: "terminal" }),
      { locale: "en" },
    );

    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            document.querySelectorAll("[data-workspace-frame]").length > 0
              ? "ok"
              : "none",
          ),
        { timeout: 45_000 },
      )
      .toBe("ok");

    // Soft switch A → B (preserves Zustand warm cache)
    await softOpenWorkspace(page, pair.b);

    await expect
      .poll(
        async () =>
          page.evaluate(
            ({ aId, bId }) => {
              const read = (id: string) => {
                const el = document.querySelector(`[data-workspace-frame="${id}"]`);
                if (!el) return "missing";
                // Warm frames use data-tier + visibility (not HTML hidden) so
                // xterm WebGL is not discarded on hop.
                return `${el.getAttribute("data-tier") ?? "?"}:${el.getAttribute("aria-hidden") ?? "?"}`;
              };
              return `${read(aId)}|${read(bId)}`;
            },
            { aId: pair.a, bId: pair.b },
          ),
        { timeout: 45_000 },
      )
      .toBe("warm:true|active:false");

    // Soft switch B → A
    await softOpenWorkspace(page, pair.a);

    await expect
      .poll(
        async () =>
          page.evaluate(
            ({ aId, bId }) => {
              const read = (id: string) => {
                const el = document.querySelector(`[data-workspace-frame="${id}"]`);
                if (!el) return "missing";
                return `${el.getAttribute("data-tier") ?? "?"}:${el.getAttribute("aria-hidden") ?? "?"}`;
              };
              return `${read(aId)}|${read(bId)}`;
            },
            { aId: pair.a, bId: pair.b },
          ),
        { timeout: 45_000 },
      )
      .toBe("active:false|warm:true");
  });
});
