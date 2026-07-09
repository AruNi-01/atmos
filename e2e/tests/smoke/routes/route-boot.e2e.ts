import { test } from "../../../fixtures/test";
import { expectHealthyRoute, routes } from "../support/app-smoke";

test.describe("smoke route boot", () => {
  for (const route of routes) {
    test(`@smoke boots ${route} without browser errors`, async ({ page }) => {
      await expectHealthyRoute(page, route);
    });
  }
});
