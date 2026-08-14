import { apiPort } from "../../fixtures/app-server";
import { expect, test, type Page } from "../../fixtures/test";
import {
  buildProjectWorkspaceDeepLink,
  connectLocalComputer,
  expectHealthyRoute,
  getRightSidebar,
  gotoContextRoute,
  stubComputerClientSettingsApi,
  withSearchParams,
} from "../smoke/support/app-smoke";

/** Chrome-safe loopback port; port 9 is on Chromium's restricted list. */
const STUB_STREAM_BASE_URL = "http://127.0.0.1:18789/s/token";
const STUB_JPEG = Buffer.from(
  "ffd8ffe000104a46494600010101000100010000ffdb004300030202020202030202020303030304060404040404080606050609080a0a090809090a0c0f0c0a0b0e0b09090d110d0e0e0f101011100a0c12131210130f101010ffc9000b080001000101011100ffcc00060010001000ffda0008000100003f00d2cf20ffd9",
  "hex",
);

type SimulatorStubOptions = {
  workspaceId: string;
  setupCode?: string;
};

type SimulatorInvoke = {
  cmd: string;
  args: unknown;
};

type SimulatorTestWindow = Window & {
  __ATMOS_DESKTOP__?: unknown;
  __ATMOS_SIMULATOR_INVOKES__?: SimulatorInvoke[];
};

const setupCodes = [
  "missing_simctl",
  "missing_ios_runtime",
  "missing_iphone",
  "helper_missing",
  "capture_xcode_mismatch",
  "platform_not_macos",
] as const;

async function mockStubSimulatorNetwork(page: Page, mjpeg: "ok" | "broken"): Promise<void> {
  await page.route("http://127.0.0.1:18789/s/token/**", async (route) => {
    const url = route.request().url();
    if (url.includes("stream.mjpeg") && mjpeg === "ok") {
      await route.fulfill({
        status: 200,
        contentType: "image/jpeg",
        body: STUB_JPEG,
      });
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
  await page.routeWebSocket(/127\.0\.0\.1:18789\/s\/token\/ws/, () => {
    // Accept the config socket so Chromium does not log a connection error.
  });
}

async function installSimulatorDesktopStub(
  page: Page,
  { workspaceId, setupCode }: SimulatorStubOptions,
): Promise<void> {
  await page.addInitScript(
    ({ workspaceId, setupCode, streamBaseUrl, apiPort }) => {
      type Listener = (payload: unknown) => void;

      const win = window as Window & {
        __ATMOS_DESKTOP__?: {
          shell: "electron";
          invoke: (cmd: string, args?: unknown) => Promise<unknown>;
          on: (event: string, handler: Listener) => () => void;
        };
        __ATMOS_SIMULATOR_INVOKES__?: SimulatorInvoke[];
      };

      const listeners = new Map<string, Set<Listener>>();
      const invokes: SimulatorInvoke[] = [];
      const facts = {
        runtimes: [],
        simulators: [],
      };

      const emit = (event: string, payload: unknown) => {
        for (const handler of listeners.get(event) ?? []) {
          handler(payload);
        }
      };

      const probe = setupCode
        ? { ok: false, code: setupCode, facts }
        : { ok: true, code: null, facts };
      const status = setupCode
        ? {
            phase: "setup_required",
            workspaceId,
            simulator: null,
            streamBaseUrl: null,
            transport: null,
            codec: null,
            size: null,
            lastError: {
              code: setupCode,
              message: `Simulator setup fixture: ${setupCode}`,
            },
          }
        : {
            phase: "streaming",
            workspaceId,
            simulator: { id: "sim-1", name: "iPhone 16", runtime: "iOS 18" },
            streamBaseUrl,
            transport: "http",
            codec: "mjpeg",
            size: { width: 390, height: 844 },
            lastError: null,
          };

      win.__ATMOS_SIMULATOR_INVOKES__ = invokes;
      win.__ATMOS_DESKTOP__ = {
        shell: "electron",
        on(event, handler) {
          const eventListeners = listeners.get(event) ?? new Set<Listener>();
          eventListeners.add(handler);
          listeners.set(event, eventListeners);
          return () => eventListeners.delete(handler);
        },
        async invoke(cmd, args) {
          invokes.push({ cmd, args });

          if (cmd === "get_api_config") {
            return { host: "127.0.0.1", port: apiPort };
          }

          if (cmd === "simulator_probe") {
            queueMicrotask(() => emit("simulator://probe", { ...probe, workspaceId }));
            return probe;
          }

          if (cmd === "simulator_attach") {
            queueMicrotask(() => {
              emit("simulator://probe", { ...probe, workspaceId });
              emit("simulator://status", status);
            });
            return status;
          }

          // Visibility, disconnect, setup actions, and all other bridge calls
          // are intentionally inert while remaining recorded above.
          return { ok: true };
        },
      };
    },
    { workspaceId, setupCode, streamBaseUrl: STUB_STREAM_BASE_URL, apiPort },
  );
}

async function seedSimulatorCenterTab(page: Page, workspaceId: string): Promise<void> {
  await page.addInitScript((id) => {
    localStorage.setItem(
      "atmos.simulator.center-tab.v1",
      JSON.stringify({
        state: {
          openByContext: { [id]: true },
          openedAtByContext: { [id]: Date.now() },
        },
        version: 0,
      }),
    );
  }, workspaceId);
}

async function getWorkspaceContext(page: Page): Promise<{
  contextUrl: string;
  workspaceId: string;
}> {
  await stubComputerClientSettingsApi(page);
  await connectLocalComputer(page, { locale: "en" });
  await expectHealthyRoute(page, "/", { locale: "en" });

  const projectUrl = withSearchParams(await buildProjectWorkspaceDeepLink(page), {
    activeSettingTab: null,
  });
  const pvUrl = new URL(projectUrl).searchParams.get("pvUrl");
  expect(pvUrl, "missing workspace preview URL").toBeTruthy();
  const workspaceId = new URL(pvUrl!).searchParams.get("id");
  expect(workspaceId, "missing workspace id in preview URL").toBeTruthy();

  return {
    contextUrl: withSearchParams(pvUrl!, { activeSettingTab: null }),
    workspaceId: workspaceId!,
  };
}

async function ensureRightSidebarExpanded(page: Page): Promise<void> {
  const expand = page.getByRole("button", { name: "Expand right sidebar" });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
  }
}

async function openSimulatorSurfaces(
  page: Page,
  options: { center: boolean; setupCode?: string; mjpeg?: "ok" | "broken" },
): Promise<void> {
  const { contextUrl, workspaceId } = await getWorkspaceContext(page);
  await installSimulatorDesktopStub(page, { workspaceId, setupCode: options.setupCode });
  if (options.center) {
    await seedSimulatorCenterTab(page, workspaceId);
  }
  await mockStubSimulatorNetwork(page, options.mjpeg ?? "ok");

  await gotoContextRoute(
    page,
    withSearchParams(contextUrl, {
      rsTab: "simulator",
      tab: options.center ? "simulator" : null,
    }),
    { locale: "en" },
  );
  await ensureRightSidebarExpanded(page);
}

async function simulatorInvokes(page: Page): Promise<SimulatorInvoke[]> {
  return await page.evaluate(
    () => (window as SimulatorTestWindow).__ATMOS_SIMULATOR_INVOKES__ ?? [],
  );
}

async function expectStreaming(page: Page, count: number): Promise<void> {
  await expect
    .poll(
      async () => page.getByText("Streaming", { exact: true }).count(),
      { timeout: 45_000 },
    )
    .toBeGreaterThanOrEqual(count);
}

test.describe("APP-058 workspace simulator", () => {
  test("S9 — hosted web states Requires Atmos Desktop without bridge invokes", async ({
    page,
  }) => {
    const { contextUrl, workspaceId } = await getWorkspaceContext(page);
    await seedSimulatorCenterTab(page, workspaceId);
    await gotoContextRoute(
      page,
      withSearchParams(contextUrl, {
        rsTab: "simulator",
        tab: "simulator",
      }),
      { locale: "en" },
    );
    await ensureRightSidebarExpanded(page);

    await expect(
      page.getByText("Requires Atmos Desktop", { exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const win = window as SimulatorTestWindow;
            return {
              invokes: typeof win.__ATMOS_SIMULATOR_INVOKES__,
              desktop: typeof win.__ATMOS_DESKTOP__,
            };
          }),
      )
      .toEqual({ invokes: "undefined", desktop: "undefined" });

    const recheck = page.getByRole("button", { name: /Re-check/i }).first();
    if (await recheck.isVisible().catch(() => false)) {
      await recheck.click();
      await expect
        .poll(
          async () =>
            page.evaluate(
              () => typeof (window as SimulatorTestWindow).__ATMOS_SIMULATOR_INVOKES__,
            ),
        )
        .toBe("undefined");
    }
  });

  test("S1 — two surfaces share one attach and stream", async ({ page }) => {
    await openSimulatorSurfaces(page, { center: true });

    await expectStreaming(page, 2);
    await expect
      .poll(
        async () =>
          (await simulatorInvokes(page)).filter((invoke) => invoke.cmd === "simulator_attach")
            .length,
        { timeout: 45_000 },
      )
      .toBe(1);
  });

  test("S3 — closing the center surface does not disconnect the session", async ({ page }) => {
    await openSimulatorSurfaces(page, { center: true });
    await expectStreaming(page, 2);

    const centerSimulatorTab = page
      .locator("main [role='tab']")
      .filter({ hasText: /^Simulator$/ })
      .first();
    await expect(centerSimulatorTab).toBeVisible();
    await centerSimulatorTab
      .getByRole("button", { name: /Close Simulator/i })
      .click({ force: true });

    const sidebar = await getRightSidebar(page);
    await expect(sidebar.getByText("Streaming", { exact: true })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await simulatorInvokes(page)).filter(
            (invoke) => invoke.cmd === "simulator_disconnect",
          ).length,
      )
      .toBe(0);
  });

  for (const setupCode of setupCodes) {
    test(`S8 — ${setupCode} renders an actionable setup card`, async ({ page }) => {
      await openSimulatorSurfaces(page, { center: true, setupCode });

      const card = page
        .getByRole("heading", { name: /Set up Simulator/i })
        .first()
        .locator("xpath=ancestor::section[1]");
      await expect(card).toBeVisible();

      await expect(card.getByRole("button", { name: /Re-check/i })).toBeVisible();

      const actionable = new Set([
        "missing_simctl",
        "missing_ios_runtime",
        "missing_iphone",
        "helper_missing",
        "capture_xcode_mismatch",
      ]);
      if (actionable.has(setupCode)) {
        const primaryButton = card
          .getByRole("button")
          .filter({ hasNotText: /Re-check/i })
          .first();
        await expect(primaryButton).toBeVisible();
        const primaryLabel = (await primaryButton.textContent()) ?? "";
        expect(primaryLabel).not.toMatch(/\b(?:npx|xcrun|simctl|serve-sim)\b/i);
      }

      if (setupCode === "missing_iphone") {
        await expect(
          card.getByRole("button", {
            name: "Create a default iPhone",
            exact: true,
          }),
        ).toBeVisible();
      }
    });
  }

  test("S21 — broken MJPEG keeps a muted skeleton in the stream area", async ({ page }) => {
    await openSimulatorSurfaces(page, { center: true, mjpeg: "broken" });
    await expectStreaming(page, 1);

    const streamImage = page.locator(`img[src*="${STUB_STREAM_BASE_URL}"]`).first();
    await expect(streamImage).toBeAttached();
    const screen = streamImage.locator("xpath=..");
    await expect(screen.locator('[aria-hidden="true"]')).toBeVisible();
  });
});
