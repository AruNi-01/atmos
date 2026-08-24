import { expect, test } from "../../fixtures/test";
import {
  connectLocalComputer,
  stubComputerClientSettingsApi,
} from "../smoke/support/app-smoke";

/**
 * APP-066: Resource Monitor
 *
 * Proves the Footer item is discoverable on a real API+web fixture, opens the
 * popover, shows Host and Atmos sections, stays inside a 390px viewport, and
 * closes. Does not invent Project/Workspace row assertions — those depend on
 * the host process table and are covered by Rust attribution tests.
 */
test.describe("APP-066 resource monitor", () => {
  test("@spec S11/S13 — Footer opens Host and Atmos sections without horizontal overflow", async ({
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
    await expect(popover.getByRole("heading", { name: "Atmos" })).toBeVisible();
    await expect(popover.getByText("Atmos Server", { exact: true })).toBeVisible();
    await expect(popover.getByText("Shared runtime", { exact: true })).toBeVisible();
    await expect(popover.getByRole("heading", { name: "Desktop" })).toHaveCount(0);

    const current = page.viewportSize();
    if (!current || current.width > 390) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(popover).toBeVisible();
      await expect(popover.getByRole("heading", { name: "Host" })).toBeVisible();
    }

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const panel = document.querySelector("[data-resource-monitor-state]");
      return {
        document: root.scrollWidth - root.clientWidth,
        body: body.scrollWidth - body.clientWidth,
        popover: panel ? panel.scrollWidth - panel.clientWidth : 0,
      };
    });
    expect(overflow.document, "document must not scroll horizontally").toBeLessThanOrEqual(1);
    expect(overflow.body, "body must not scroll horizontally").toBeLessThanOrEqual(1);
    expect(overflow.popover, "popover body must not overflow horizontally").toBeLessThanOrEqual(1);

    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(footerItem).toBeVisible();
  });
});
