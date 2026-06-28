import { expect, test } from "../../../fixtures/test";
import {
  connectLocalComputer,
  stubComputerClientSettingsApi,
} from "../support/app-smoke";

test.describe("smoke app shell workspace composer", () => {
  test("@smoke @stateful exercises read-only workspace composer controls", async ({ page }) => {
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    const addProjectButton = page.getByRole("button", { name: "Add Project" });
    await addProjectButton.scrollIntoViewIfNeeded();
    await addProjectButton.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    const importProjectDialog = page.getByRole("dialog", { name: "Import Project" });
    await expect(importProjectDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(importProjectDialog).toBeHidden();

    await page.getByRole("button", { name: "Select agent" }).click();
    await expect(page.getByText("Claude Code", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "No priority" }).click();
    await expect(page.getByText("Urgent", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "In Progress" }).click();
    await expect(page.getByText("Backlog", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "+ Label" }).click();
    await expect(page.getByText("Create New", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Open advanced workspace options" }).click();
    await expect(page.getByText("GitHub issue", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open advanced workspace options" }).click();
    await expect(page.getByText("GitHub issue", { exact: true })).toBeHidden();
  });
});
