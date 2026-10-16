import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";
import { paired } from "./env.ts";

// Doctor: the app launches and an unpaired install lands on the pair screen.
// Runs on any simulator with the app installed; no Computer, no model.
test(
  "unpaired launch shows the pair screen",
  { skip: paired ? "app is paired; pair screen not shown" : false },
  async ({ app, screen }) => {
    await app.open();
    // A Release cold start can take a few seconds to draw its first frame.
    await expect(screen.getByText("Pair this phone with your Computer.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(screen.getByText("Scan QR")).toBeVisible();
    await expect(screen.getByText("Continue with GitHub")).toBeVisible();
  },
);

// Paired install: the app lands on the workspace list instead.
test(
  "paired launch shows the workspace list",
  { skip: paired ? false : "app is not paired (set ATMOS_E2E_PAIRED=1 for a paired install)" },
  async ({ app, screen }) => {
    await app.open();
    await expect(screen.getByTestId("Workspace")).toBeVisible({ timeout: 30_000 });
  },
);
