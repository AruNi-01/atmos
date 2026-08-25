import { apiPort } from "../../fixtures/app-server";
import { expect, test } from "../../fixtures/test";
import {
  buildProjectWorkspaceDeepLink,
  connectLocalComputer,
  gotoContextRoute,
  normalizePathname,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../smoke/support/app-smoke";

/**
 * APP-066: Resource Monitor
 *
 * S11/S13/S16 — Footer + Host metrics / sort / chart, 390px, close.
 * S14/S15 — real default-space Terminal session click. Extra/custom Center
 * Space hops stay in Bun locator/navigation tests; this file does not fake UI.
 */

async function computerWsRequest<T>(
  page: import("@playwright/test").Page,
  action: string,
  data: unknown,
): Promise<T> {
  return page.evaluate(
    async ({ apiPort, action, data }) => {
      return await new Promise<T>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const socket = new WebSocket(`ws://127.0.0.1:${apiPort}/ws?client_type=web`);
        let settled = false;
        const finish = (callback: (value: unknown) => void, value: unknown) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          try {
            socket.close();
          } catch {
            // ignore
          }
          callback(value);
        };
        const timeoutId = window.setTimeout(() => {
          finish((value) => reject(value as Error), new Error(`WebSocket timeout for ${action}`));
        }, 30_000);
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
            payload?: { request_id?: string; success?: boolean; data?: T; message?: string };
          };
          if (message.payload?.request_id !== requestId) return;
          if (message.type === "response" && message.payload?.success) {
            finish((value) => resolve(value as T), message.payload.data);
            return;
          }
          finish(
            (value) => reject(value as Error),
            new Error(message.payload?.message ?? `WebSocket request failed for ${action}`),
          );
        });
        socket.addEventListener("error", () => {
          finish((value) => reject(value as Error), new Error(`WebSocket transport error for ${action}`));
        });
      });
    },
    { apiPort, action, data },
  );
}

async function createIsolatedWorkspace(
  page: import("@playwright/test").Page,
  projectGuid: string,
): Promise<string> {
  const stamp = Math.random().toString(36).slice(2, 8);
  const workspace = await computerWsRequest<{ guid?: string }>(page, "workspace_create", {
    project_guid: projectGuid,
    name: `e2e/${stamp}`,
    display_name: stamp,
    branch: `e2e/${stamp}`,
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
  const guid = workspace.guid?.trim() ?? "";
  expect(guid, "isolated workspace guid").not.toBe("");
  return guid;
}

async function deleteIsolatedWorkspace(
  page: import("@playwright/test").Page,
  guid: string,
  projectGuid: string,
): Promise<void> {
  await page.keyboard.press("Escape").catch(() => undefined);
  const closePane = page.locator(".terminal-pane").getByRole("button", { name: /^Close/ }).first();
  if (await closePane.isVisible().catch(() => false)) {
    await closePane.click({ timeout: 2_000 }).catch(() => undefined);
  }
  await computerWsRequest(page, "workspace_delete", { guid });
  const remaining = await computerWsRequest<Array<{ guid?: string; is_archived?: boolean | null }>>(
    page,
    "workspace_list",
    { project_guid: projectGuid },
  );
  if (remaining.some((workspace) => workspace.guid === guid && !workspace.is_archived)) {
    throw new Error(`workspace_delete left active workspace ${guid}`);
  }
}

async function openWorkspaceTerminalTab(
  page: import("@playwright/test").Page,
  workspaceGuid: string,
): Promise<void> {
  const workspaceUrl = `${new URL(page.url()).origin}/workspace?id=${workspaceGuid}`;
  const dest = withSearchParams(workspaceUrl, {
    tab: "terminal",
    activeSettingTab: null,
    settingsModal: null,
  });
  try {
    await gotoContextRoute(page, dest, { locale: "en" });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await gotoContextRoute(page, dest, { locale: "en" });
  }
  await expect
    .poll(async () => normalizePathname(new URL(page.url()).pathname), { timeout: 45_000 })
    .toBe("/workspace");
  await expect
    .poll(async () => new URL(page.url()).searchParams.get("id"), { timeout: 45_000 })
    .toBe(workspaceGuid);
  await expect(page.locator(".terminal-pane").first()).toBeVisible({ timeout: 45_000 });
}

async function readTerminalAttachState(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const isShown = (el: Element | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const frame = el.closest("[data-workspace-frame]");
      if (frame?.getAttribute("data-tier") === "warm") return false;
      if (frame?.getAttribute("aria-hidden") === "true") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    };
    const terminals = [...document.querySelectorAll<HTMLElement>(".atmos-terminal[data-session-id]")].filter(
      (el) => isShown(el.closest(".terminal-pane")),
    );
    const live = terminals.find((el) => {
      const sessionId = el.getAttribute("data-session-id")?.trim() ?? "";
      const connected = el.getAttribute("data-connected") === "true";
      const status = el.getAttribute("data-status") ?? "";
      return Boolean(sessionId) && (connected || status === "connected");
    });
    const first = live ?? terminals[0];
    const pane = first?.closest(".terminal-pane") ?? document.querySelector(".terminal-pane");
    const errorText =
      [...(pane?.querySelectorAll("p, div") ?? [])]
        .map((el) => el.textContent?.trim() ?? "")
        .find((text) => text.length < 240 && /failed to attach|failed to connect|can't find session/i.test(text)) ??
      "";
    return {
      status: live
        ? "ready"
        : first?.getAttribute("data-status") || (pane && isShown(pane) ? "waiting" : "missing"),
      errorText,
      paneId: pane?.querySelector("[data-pane-id]")?.getAttribute("data-pane-id")?.trim() ?? "",
      sessionId: first?.getAttribute("data-session-id")?.trim() ?? "",
      hadAttentionRing: pane?.classList.contains("agent-attention-ring") ?? false,
    };
  });
}

async function waitForLiveTerminalTarget(page: import("@playwright/test").Page): Promise<{
  paneId: string;
  sessionId: string;
  tmuxWindowName: string | null;
  hadAttentionRing: boolean;
}> {
  await expect(page.locator(".terminal-pane").first()).toBeVisible({ timeout: 60_000 });
  const newButton = page.getByRole("button", { name: /^New$/ });
  await expect
    .poll(
      async () => {
        const state = await readTerminalAttachState(page);
        if (state.status === "ready") return "ready";
        if (await newButton.isVisible().catch(() => false)) return "recover";
        return state.status;
      },
      { timeout: 45_000 },
    )
    .toMatch(/^(ready|recover)$/);
  if (await newButton.isVisible().catch(() => false)) {
    await newButton.click();
  }
  try {
    await expect
      .poll(async () => (await readTerminalAttachState(page)).status, { timeout: 60_000 })
      .toBe("ready");
  } catch {
    const state = await readTerminalAttachState(page);
    throw new Error(`workspace Terminal fixture did not connect: ${state.errorText || state.status}`);
  }
  const target = await readTerminalAttachState(page);
  expect(target.status, "live visible .terminal-pane must be connected").toBe("ready");
  expect(target.paneId, "live .terminal-pane must expose pane id").not.toBe("");
  expect(target.sessionId, "live .atmos-terminal must expose session id").not.toBe("");
  return {
    paneId: target.paneId,
    sessionId: target.sessionId,
    tmuxWindowName: new URL(page.url()).searchParams.get("terminalTmux")?.trim() || null,
    hadAttentionRing: target.hadAttentionRing,
  };
}

function quoteAttr(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function sessionRoot(
  popover: import("@playwright/test").Locator,
  sessionId: string,
): import("@playwright/test").Locator {
  return popover.locator(
    `[data-resource-monitor-session][data-session-id="${quoteAttr(sessionId)}"]`,
  );
}

async function expandClosedGroupRows(
  popover: import("@playwright/test").Locator,
): Promise<void> {
  const closed = popover.locator(
    "[data-resource-monitor-table] button[aria-expanded='false']:not([data-resource-monitor-session-trigger])",
  );
  if ((await closed.count()) > 0) {
    await closed.first().click();
  }
}

async function revealLocatableSessionButton(
  popover: import("@playwright/test").Locator,
  page: import("@playwright/test").Page,
  sessionId?: string,
): Promise<import("@playwright/test").Locator> {
  const sessionButton = sessionId
    ? sessionRoot(popover, sessionId).locator("[data-resource-monitor-session-locate]").or(
        sessionRoot(popover, sessionId).getByRole("button", { name: /Show this terminal/ }),
      )
    : popover.getByRole("button", { name: /Show this terminal/ });
  try {
    await expect
      .poll(
        async () => {
          if ((await sessionButton.count()) > 0 && (await sessionButton.first().isVisible())) {
            return "visible";
          }
          await expandClosedGroupRows(popover);
          return "expanded";
        },
        { timeout: 45_000 },
      )
      .toBe("visible");
  } catch {
    const terminal = await readTerminalAttachState(page);
    const hierarchy = (await popover.locator("[data-resource-monitor-table]").innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .slice(0, 400);
    throw new Error(
      `no locatable Resource Monitor session (aria Show this terminal). ` +
        `visible terminal=${terminal.status}${terminal.errorText ? ` (${terminal.errorText})` : ""}; ` +
        `hierarchy=${hierarchy || "empty"}`,
    );
  }
  await sessionButton.first().scrollIntoViewIfNeeded();
  return sessionButton.first();
}

async function expandSessionProcesses(
  popover: import("@playwright/test").Locator,
  sessionId: string,
): Promise<void> {
  const root = sessionRoot(popover, sessionId);
  await expect(root).toBeVisible({ timeout: 15_000 });
  const trigger = root.locator("[data-resource-monitor-session-trigger]");
  await expect(trigger, "session process trigger must exist after listener starts").toHaveCount(1);
  if ((await trigger.getAttribute("aria-expanded")) === "false") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

async function readHorizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const panel = document.querySelector("[data-resource-monitor-state]");
    return {
      document: root.scrollWidth - root.clientWidth,
      body: body.scrollWidth - body.clientWidth,
      popover: panel ? panel.scrollWidth - panel.clientWidth : 0,
    };
  });
}

type ResourceMonitorProcessLeaf = { name?: string; ports?: number[] };
type ResourceMonitorSnapshotProbe = {
  projects?: Array<{
    sessions?: Array<{ session_id?: string; processes?: ResourceMonitorProcessLeaf[] }>;
    other_processes?: ResourceMonitorProcessLeaf[];
    workspaces?: Array<{
      workspace_id?: string;
      sessions?: Array<{ session_id?: string; processes?: ResourceMonitorProcessLeaf[] }>;
      other_processes?: ResourceMonitorProcessLeaf[];
    }>;
  }>;
};

function snapshotListsPort(snapshot: ResourceMonitorSnapshotProbe, port: number): boolean {
  const leaves: ResourceMonitorProcessLeaf[] = [];
  for (const project of snapshot.projects ?? []) {
    for (const session of project.sessions ?? []) leaves.push(...(session.processes ?? []));
    leaves.push(...(project.other_processes ?? []));
    for (const workspace of project.workspaces ?? []) {
      for (const session of workspace.sessions ?? []) leaves.push(...(session.processes ?? []));
      leaves.push(...(workspace.other_processes ?? []));
    }
  }
  return leaves.some((leaf) => (leaf.ports ?? []).includes(port));
}

async function isHttpOpen(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(800),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function workerHttpPort(workerIndex: number): number {
  return 49152 + (workerIndex % 24) * 640 + Math.floor(Math.random() * 500);
}

test.describe("APP-066 resource monitor", () => {
  test("@spec S11/S13/S16 — Footer opens Host metrics, sort, and chart without overflow", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "en" });

    const footerItem = page.getByRole("button", { name: "Resource Monitor" });
    await expect(footerItem).toBeVisible({ timeout: 45_000 });

    await footerItem.click();

    const popover = page.locator("[data-resource-monitor-state]");
    await expect(popover).toBeVisible({ timeout: 15_000 });
    await expect(popover.getByRole("heading", { name: "Resource Monitor" })).toBeVisible();
    await expect(popover.getByRole("heading", { name: "Host" })).toBeVisible({
      timeout: 30_000,
    });

    const host = popover.locator("[data-resource-monitor-host]");
    await expect(host).toBeVisible();
    await expect(host.getByText("CPU", { exact: true })).toBeVisible();
    await expect(host.getByText("Memory", { exact: true })).toBeVisible();
    await expect(host.getByText(/%/)).toBeVisible();
    await expect(host.getByText(/^of /)).toBeVisible();
    await expect(host.getByText(/logical CPU/i)).toBeVisible();

    const sort = popover.locator("[data-resource-monitor-sort]");
    await expect(sort).toBeVisible();
    await expect(popover.getByRole("toolbar")).toHaveCount(0);
    await expect(sort.getByRole("button", { name: /Name/ })).toBeVisible();
    await expect(sort.getByRole("button", { name: /CPU/ })).toBeVisible();
    await expect(sort.getByRole("button", { name: /Memory/ })).toBeVisible();
    await sort.getByRole("button", { name: /Name/ }).click();
    await expect(sort.getByRole("button", { name: /Name/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(sort.getByRole("button", { name: /Name, ascending/i })).toBeVisible();

    const collecting = popover.locator("[data-resource-monitor-collecting]");
    const chart = popover.locator("[data-resource-monitor-chart]");
    await expect(collecting.or(chart)).toBeVisible();

    await expect(popover.getByText("Atmos Server", { exact: true })).toBeVisible();
    await expect(popover.getByText("Shared runtime", { exact: true })).toBeVisible();
    await expect(popover.getByRole("heading", { name: "Desktop" })).toHaveCount(0);

    const current = page.viewportSize();
    if (!current || current.width > 390) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(popover).toBeVisible();
      await expect(popover.getByRole("heading", { name: "Host" })).toBeVisible();
    }

    const overflow = await readHorizontalOverflow(page);
    expect(overflow.document, "document must not scroll horizontally").toBeLessThanOrEqual(1);
    expect(overflow.body, "body must not scroll horizontally").toBeLessThanOrEqual(1);
    expect(overflow.popover, "popover body must not overflow horizontally").toBeLessThanOrEqual(1);

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(footerItem).toBeVisible();
  });

  test("@spec S14/S15 — session click locates the live default-space terminal pane", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "en" });

    const projectDeepLink = await buildProjectWorkspaceDeepLink(page);
    const projectGuid = new URL(projectDeepLink).searchParams.get("id")?.trim() ?? "";
    expect(projectGuid, "missing project id in seed deep link").not.toBe("");

    let createdGuid = "";
    let testError: unknown;
    try {
      createdGuid = await createIsolatedWorkspace(page, projectGuid);
      await openWorkspaceTerminalTab(page, createdGuid);
      const target = await waitForLiveTerminalTarget(page);
      const targetPane = page.locator(".terminal-pane").filter({
        has: page.locator(`[data-pane-id="${target.paneId}"]`),
      });
      await expect(targetPane).toBeVisible();
      await expect(
        targetPane.locator(`.atmos-terminal[data-session-id="${target.sessionId}"]`),
      ).toBeVisible();

      const footerItem = page.getByRole("button", { name: "Resource Monitor" });
      await expect(footerItem).toBeVisible({ timeout: 45_000 });
      await footerItem.click();

      const popover = page.locator("[data-resource-monitor-state]");
      await expect(popover).toBeVisible({ timeout: 15_000 });
      await expect(popover.getByRole("heading", { name: "Host" })).toBeVisible({
        timeout: 30_000,
      });

      const sessionButton = await revealLocatableSessionButton(popover, page, target.sessionId);
      await expect(sessionButton).toBeVisible();
      await expect(sessionButton).toHaveAttribute("aria-label", /Show this terminal/);

      let committedTmux: string | null = null;
      const destCommitted = page.waitForURL((url) => {
        if (normalizePathname(url.pathname) !== "/workspace") return false;
        if (url.searchParams.get("id") !== createdGuid) return false;
        if (url.searchParams.get("tab") !== "terminal") return false;
        committedTmux = url.searchParams.get("terminalTmux")?.trim() || null;
        return true;
      }, { timeout: 8_000 });

      await sessionButton.click();

      await Promise.all([
        destCommitted,
        expect(popover).toBeHidden({ timeout: 8_000 }),
        expect(targetPane).toHaveAttribute("data-resource-locate-ring", "", {
          timeout: 8_000,
        }),
      ]);
      await expect(targetPane).toHaveClass(/resource-locate-ring/);

      await expect
        .poll(async () => normalizePathname(new URL(page.url()).pathname), { timeout: 8_000 })
        .toBe("/workspace");
      await expect
        .poll(async () => new URL(page.url()).searchParams.get("id"), { timeout: 8_000 })
        .toBe(createdGuid);
      const destTmux =
        committedTmux ?? new URL(page.url()).searchParams.get("terminalTmux")?.trim() ?? null;
      if (target.tmuxWindowName) {
        expect(destTmux, "dest terminalTmux must match the recorded live window").toBe(
          target.tmuxWindowName,
        );
      }

      await expect
        .poll(
          async () =>
            page.evaluate(
              ({ paneId }) => {
                const content = document.querySelector(`[data-pane-id="${CSS.escape(paneId)}"]`);
                const paneEl = content?.closest(".terminal-pane");
                if (!paneEl) return "missing";
                const footer = document.querySelector("[data-resource-monitor-footer]");
                const active = document.activeElement;
                if (footer && active && (active === footer || footer.contains(active))) {
                  return "footer";
                }
                if (paneEl.classList.contains("is-inactive-pane")) return "inactive";
                if (active && paneEl.contains(active)) return "focused";
                if (paneEl.classList.contains("is-active-pane")) return "active";
                const otherActive = document.querySelector(".terminal-pane.is-active-pane");
                if (!otherActive) return "sole-active";
                return "other";
              },
              { paneId: target.paneId },
            ),
          { timeout: 8_000 },
        )
        .toMatch(/^(focused|active|sole-active)$/);

      const attentionAfter = await targetPane.evaluate((el) =>
        el.classList.contains("agent-attention-ring"),
      );
      expect(attentionAfter, "session locate must not forge agent attention").toBe(
        target.hadAttentionRing,
      );
    } catch (error) {
      testError = error;
      throw error;
    } finally {
      if (createdGuid) {
        try {
          await deleteIsolatedWorkspace(page, createdGuid, projectGuid);
        } catch (cleanupError) {
          if (!testError) throw cleanupError;
        }
      }
    }
  });

  test("@spec S18 — session process row shows the live listener port", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "S18 proves the live listener and 390px overflow on chromium",
    );
    test.setTimeout(150_000);

    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "en" });

    const projectDeepLink = await buildProjectWorkspaceDeepLink(page);
    const projectGuid = new URL(projectDeepLink).searchParams.get("id")?.trim() ?? "";
    expect(projectGuid, "missing project id in seed deep link").not.toBe("");

    const port = workerHttpPort(testInfo.parallelIndex);
    let createdGuid = "";
    let testError: unknown;
    try {
      createdGuid = await createIsolatedWorkspace(page, projectGuid);
      await openWorkspaceTerminalTab(page, createdGuid);
      const target = await waitForLiveTerminalTarget(page);
      const targetPane = page.locator(".terminal-pane").filter({
        has: page.locator(`[data-pane-id="${target.paneId}"]`),
      });
      await expect(targetPane).toBeVisible();

      const terminal = targetPane.locator(`.atmos-terminal[data-session-id="${target.sessionId}"]`);
      await expect(terminal).toBeVisible();
      const helper = targetPane.locator("textarea.xterm-helper-textarea");
      if ((await helper.count()) > 0) {
        await helper.click();
      } else {
        await terminal.click();
      }
      const command = `node -e "require('http').createServer((q,s)=>s.end('ok')).listen(${port},'127.0.0.1')"`;
      await page.keyboard.type(command, { delay: 8 });
      await page.keyboard.press("Enter");

      await expect
        .poll(() => isHttpOpen(port), { timeout: 45_000 })
        .toBe(true);

      const scan = await computerWsRequest<{ services?: Array<{ port?: number }> }>(
        page,
        "local_services_scan",
        { scope: "all_atmos_projects", force: true },
      );
      expect(scan, "local_services_scan must return a payload").toBeTruthy();

      await expect
        .poll(
          async () => {
            const snapshot = await computerWsRequest<ResourceMonitorSnapshotProbe>(
              page,
              "resource_monitor_get",
              {},
            );
            return snapshotListsPort(snapshot, port);
          },
          { timeout: 60_000 },
        )
        .toBe(true);

      const footerItem = page.getByRole("button", { name: "Resource Monitor" });
      await expect(footerItem).toBeVisible({ timeout: 45_000 });
      await footerItem.click();
      const popover = page.locator("[data-resource-monitor-state]");
      await expect(popover).toBeVisible({ timeout: 15_000 });
      await expect(popover.getByRole("heading", { name: "Host" })).toBeVisible({
        timeout: 30_000,
      });

      const workspaceTrigger = popover.locator(
        `[data-resource-monitor-workspace="${quoteAttr(createdGuid)}"]`,
      );
      await expect
        .poll(
          async () => {
            if ((await workspaceTrigger.count()) > 0) return "ready";
            await expandClosedGroupRows(popover);
            return "expanding";
          },
          { timeout: 45_000 },
        )
        .toBe("ready");
      if ((await workspaceTrigger.getAttribute("aria-expanded")) === "false") {
        await workspaceTrigger.click();
      }

      const resourcesTrigger = popover.locator("[data-resource-monitor-project-resources]");
      if ((await resourcesTrigger.count()) > 0) {
        if ((await resourcesTrigger.getAttribute("aria-expanded")) === "false") {
          await resourcesTrigger.click();
        }
      }

      await revealLocatableSessionButton(popover, page, target.sessionId);
      await expandSessionProcesses(popover, target.sessionId);

      const processRows = sessionRoot(popover, target.sessionId).locator(
        "[data-resource-monitor-process]",
      );
      await expect(processRows.first(), "session must expose a process row").toBeVisible({
        timeout: 15_000,
      });
      await expect(
        popover.locator(`[data-resource-monitor-port="${port}"]`).first(),
        `listening port :${port} must be visible`,
      ).toBeVisible();
      await expect(popover.locator(`[data-resource-monitor-port="${port}"]`).first()).toHaveText(
        `:${port}`,
      );

      const processText = (await processRows.allInnerTexts()).join(" ").replace(/\s+/g, " ");
      expect(processText, "process rows must show a basename").toMatch(/[A-Za-z0-9._-]+/);
      expect(processText, "process rows must not show a PID").not.toMatch(/\bpid\b/i);
      expect(processText, "process rows must not show a command line").not.toMatch(
        /\b(cmd|cmdline|command_line)\b/i,
      );
      expect(processText, "process rows must not show a host path").not.toMatch(
        /\/Users\/|\/home\/|[A-Za-z]:\\/i,
      );

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(popover).toBeVisible();
      const overflow = await readHorizontalOverflow(page);
      expect(overflow.document, "document must not scroll horizontally").toBeLessThanOrEqual(1);
      expect(overflow.body, "body must not scroll horizontally").toBeLessThanOrEqual(1);
      expect(overflow.popover, "expanded popover must not overflow horizontally").toBeLessThanOrEqual(
        1,
      );
    } catch (error) {
      testError = error;
      throw error;
    } finally {
      await page.keyboard.press("Control+C").catch(() => undefined);
      if (createdGuid) {
        try {
          await deleteIsolatedWorkspace(page, createdGuid, projectGuid);
        } catch (cleanupError) {
          if (!testError) throw cleanupError;
        }
      }
      await expect
        .poll(() => isHttpOpen(port), { timeout: 20_000 })
        .toBe(false);
    }
  });
});
