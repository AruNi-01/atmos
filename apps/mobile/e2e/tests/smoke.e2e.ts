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
    await expect(screen.getByText("Pair this phone with your Computer.")).toBeVisible();
    await expect(screen.getByText("Scan QR")).toBeVisible();
    await expect(screen.getByText("Continue with GitHub")).toBeVisible();
  },
);
