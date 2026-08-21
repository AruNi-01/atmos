import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("browser settings store", () => {
  it("defaults browser surface to center only", () => {
    const src = readFileSync(
      join(root, "apps/web/src/features/settings/store/browser-settings-store.ts"),
      "utf8",
    );
    expect(src).toContain('export type BrowserDefaultSurface = "center"');
    expect(src).toContain('functionSettingsApi.update("browser", "default_surface"');
    expect(src).not.toContain('"sidebar"');
    expect(src).toContain("show_agent_chrome");
    expect(src).toContain("new_tab_url");
  });
});
