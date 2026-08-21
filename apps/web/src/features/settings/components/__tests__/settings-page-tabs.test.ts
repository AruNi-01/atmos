import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("Settings page group tabs", () => {
  it("uses the Tasks pill tabs in the settings header", () => {
    const modal = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModal.tsx"),
      "utf8",
    );
    const tabs = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsPageTabs.tsx"),
      "utf8",
    );
    expect(tabs).toContain('@workspace/ui/components/motion/tabs');
    expect(tabs).toContain('variant="pill"');
    expect(tabs).toContain('h-9 gap-1 p-1');
    expect(tabs).toContain('h-7 gap-1.5 px-3.5 text-sm');
    expect(modal).toContain("SettingsPageTabs");
    expect(modal).toContain("useSettingsGroupTab");
    expect(modal).not.toContain("text-[28px]");
  });

  it("splits stacked settings groups instead of rendering them together", () => {
    const sections = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModalSections.tsx"),
      "utf8",
    );
    expect(sections).toContain("activeGroupTab");
    expect(sections).toContain("activeGroupTab === 'browser'");
    expect(sections).toContain("activeGroupTab === 'desktop-use'");
    expect(sections).toContain("activeGroupTab === 'tunnel-connector'");
    expect(sections).toContain("activeGroupTab === 'labels'");
    expect(sections).toContain("activeGroupTab === 'canvas'");
    expect(sections).toContain("activeGroupTab === 'about'");
    expect(sections).not.toContain("NestedSettingsSection");
    expect(sections).not.toContain("SettingsPageStack");
  });
});
