import { test } from "../../../fixtures/test";
import { expectHealthyRoute, locales, routes } from "../support/app-smoke";

test.describe("smoke route boot", () => {
  for (const locale of locales) {
    for (const route of routes) {
      test(`@smoke boots /${locale}${route || ""} without browser errors`, async ({ page }) => {
        await expectHealthyRoute(page, locale, route);
      });
    }
  }
});
