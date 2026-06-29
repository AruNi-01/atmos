import { defineConfig, devices } from "@playwright/test";
import {
  baseURL,
  shouldReuseWebServer,
  shouldStartWebServer,
  webAppDir,
  webHealthURL,
  webServerCommand,
} from "./fixtures/app-server";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  outputDir: "./test-results",
  globalSetup: "./fixtures/global-setup.ts",
  globalTeardown: "./fixtures/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/html", open: "never" }],
    ["json", { outputFile: "reports/results.json" }],
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: shouldStartWebServer
      ? {
          command: webServerCommand(),
          cwd: webAppDir,
          url: webHealthURL,
          reuseExistingServer: shouldReuseWebServer && !isCI,
          timeout: 900_000,
          stdout: "pipe",
          stderr: "pipe",
        }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
