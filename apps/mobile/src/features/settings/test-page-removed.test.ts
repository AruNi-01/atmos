// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(here, "../../..");
const repoRoot = join(mobileRoot, "../..");

describe("developer test page", () => {
  test("removes the preview route, fixtures, and store", () => {
    const removed = [
      "app/preview.tsx",
      "src/features/preview/PreviewModeSwitch.tsx",
      "src/features/preview/PreviewTerminalScreen.tsx",
      "src/features/preview/preview-fixtures.ts",
      "src/features/preview/preview-fixtures.test.ts",
      "src/stores/preview-store.ts",
    ];
    for (const relative of removed) {
      expect(existsSync(join(mobileRoot, relative))).toBe(false);
    }
    expect(existsSync(join(mobileRoot, "app/preview-chat.tsx"))).toBe(true);
    const layout = readFileSync(join(mobileRoot, "app/_layout.tsx"), "utf8");
    expect(layout).not.toContain('name="preview"');
    expect(layout).toContain('name="preview-chat"');
  });

  test("drops the Settings entry and its copy", () => {
    const settings = readFileSync(join(here, "SettingsIndexScreen.tsx"), "utf8");
    expect(settings).not.toContain("Test page");
    expect(settings).not.toContain("Preview terminals without a Computer");
    expect(settings).not.toContain("PreviewModeSwitch");
    expect(settings).toContain('params: { mode: "scan" }');
  });

  test("keeps the repo lint warning cap", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      scripts: { lint: string };
    };
    expect(packageJson.scripts.lint).toBe("oxlint --max-warnings=455");
  });
});
