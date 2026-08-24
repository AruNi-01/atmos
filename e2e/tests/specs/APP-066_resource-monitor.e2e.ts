import { expect, test } from "../../fixtures/test";
import {
  connectLocalComputer,
  stubComputerClientSettingsApi,
} from "../smoke/support/app-smoke";

/**
 * APP-066: Resource Monitor
 *
 * Proves the Footer item is discoverable on a real API+web fixture, opens the
 * popover, shows Host metrics / sort / chart-or-collecting, stays inside a
 * 390px viewport, and closes. Does not invent session click assertions —
 * those depend on live panes and are covered by locator/navigation unit tests.
 */
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
