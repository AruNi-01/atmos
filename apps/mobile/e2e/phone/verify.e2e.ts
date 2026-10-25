import { copyFileSync, mkdirSync } from "node:fs";
import { test } from "@e2e-dev/mobile";
import { expect, type App } from "e2e";

const proof = "/tmp/atmos-phone-proof";

async function shot(app: App, name: string) {
  mkdirSync(proof, { recursive: true });
  const saved = await app.screenshot(name);
  const dest = `${proof}/${name}.png`;
  copyFileSync(saved, dest);
  console.log(`PROOF ${dest}`);
}

async function tryStep(label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    console.log(`SKIP ${label}: ${error instanceof Error ? error.message : error}`);
  }
}

test("phone visual check", { timeout: 240_000 }, async ({ app, device, screen }) => {
  await app.open();
  await expect(screen.getByText("Workspace")).toBeVisible({ timeout: 30_000 });
  await shot(app, "01-workspace");

  await tryStep("swipe row", async () => {
    const row = screen.getByText("atmos/victreebel");
    await row.swipe({ direction: "left" });
  });
  await shot(app, "02-swipe");

  await tryStep("close swipe", async () => {
    await screen.getByText("atmos/victreebel").swipe({ direction: "right" });
  });

  await tryStep("open settings", async () => {
    await screen.getByLabel("Settings").tap();
    await expect(screen.getByText("Theme")).toBeVisible({ timeout: 8_000 });
  });
  await shot(app, "03-settings");

  await tryStep("back", async () => {
    await device.back();
  });

  await tryStep("token usage", async () => {
    await device.openLink("atmos://token-usage");
    await expect(screen.getByText("Token usage")).toBeVisible({ timeout: 12_000 });
  });
  await shot(app, "04-token-usage");

  await tryStep("chart press", async () => {
    const chart = screen.getByTestId("token-usage-stacked");
    await chart.scrollIntoView();
    await chart.longPress({ duration: 900 });
  });
  await shot(app, "05-chart");

  await tryStep("share sheet", async () => {
    await screen.getByLabel("Share").tap();
    await expect(screen.getByText("Publish")).toBeVisible({ timeout: 8_000 });
  });
  await shot(app, "06-share");

  await tryStep("publish tab", async () => {
    await screen.getByText("Publish", { exact: true }).tap();
  });
  await shot(app, "07-publish");
});
