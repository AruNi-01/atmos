import { test as base, expect } from "@playwright/test";
import { attachBrowserErrorCollector } from "./console-errors";

type AtmosFixtures = {
  browserErrorCollector: void;
};

export const test = base.extend<AtmosFixtures>({
  browserErrorCollector: [
    async ({ page }, use, testInfo) => {
      const assertNoBrowserErrors = await attachBrowserErrorCollector(page, testInfo);
      await use();
      await assertNoBrowserErrors();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from "@playwright/test";
