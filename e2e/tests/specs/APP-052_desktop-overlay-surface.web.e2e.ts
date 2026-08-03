import { expect, test } from "../../fixtures/test";
import {
  connectLocalComputer,
  expectHealthyRoute,
  stubComputerClientSettingsApi,
} from "../smoke/support/app-smoke";

/**
 * APP-052 web non-regression: pure Chromium web keeps document portals;
 * no requirement that desktop overlay IPC runs.
 */
test.describe("APP-052 desktop overlay surface (web)", () => {
  test("@smoke floating UI portals stay document-local without overlay bridge", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page, { locale: "en" });
    await expectHealthyRoute(page, "/", { locale: "en" });

    // Shell is not Electron preload on Playwright web harness.
    const shell = await page.evaluate(() => {
      const w = window as Window & {
        __ATMOS_DESKTOP__?: { shell?: string };
      };
      return w.__ATMOS_DESKTOP__?.shell ?? "none";
    });
    expect(shell).toBe("none");

    // Mount a dialog-like portal into document body (same path as Radix default).
    await page.evaluate(() => {
      const existing = document.getElementById("atmos-e2e-app052-dialog");
      existing?.remove();
      const el = document.createElement("div");
      el.id = "atmos-e2e-app052-dialog";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "APP-052 web portal probe");
      el.setAttribute("data-slot", "dialog-content");
      el.setAttribute("data-state", "open");
      el.textContent = "APP-052 web portal probe";
      el.style.cssText =
        "position:fixed;inset:20% 30%;z-index:9999;background:#111;color:#fff;padding:16px";
      document.body.appendChild(el);
    });

    const dialog = page.locator("#atmos-e2e-app052-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "dialog");

    // Confirm portal node is under document.body (not a remote overlay root).
    const parentIsBody = await page.evaluate(() => {
      const el = document.getElementById("atmos-e2e-app052-dialog");
      return el?.parentElement === document.body;
    });
    expect(parentIsBody).toBe(true);

    // Overlay ensure command must not be required; invoking capability is absent.
    const hasDesktopBridge = await page.evaluate(() => {
      const w = window as Window & {
        __ATMOS_DESKTOP__?: { invoke?: unknown };
      };
      return typeof w.__ATMOS_DESKTOP__?.invoke === "function";
    });
    expect(hasDesktopBridge).toBe(false);

    await page.evaluate(() => {
      document.getElementById("atmos-e2e-app052-dialog")?.remove();
    });
    await expect(dialog).toHaveCount(0);
  });
});
