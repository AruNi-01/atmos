import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("APP-059 Browser settings wiring", () => {
  it("registers browser settings section in Interface", () => {
    const data = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings-modal-data.ts"),
      "utf8",
    );
    expect(data).toContain('"browser"');
    expect(data).toContain("sections.browser");
    expect(data).toContain("browser.defaultSurface");
  });

  it("includes browser in SettingsModalTab enum list", () => {
    const params = readFileSync(
      join(root, "apps/web/src/shared/lib/nuqs/searchParams.ts"),
      "utf8",
    );
    expect(params).toContain('"browser"');
  });

  it("SettingsModalSections renders BrowserSettingsSection", () => {
    const sections = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModalSections.tsx"),
      "utf8",
    );
    expect(sections).toContain("BrowserSettingsSection");
    expect(sections).toContain("case 'browser'");
  });

  it("Layout no longer owns the Browser module row", () => {
    const layout = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/RightSidebarLayoutSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(layout).not.toContain("browserTitle");
    expect(layout).not.toContain("setRightSidebarShowBrowser");
  });

  it("Browser page uses sentence-case surface labels", () => {
    const section = readFileSync(
      join(root, "apps/web/src/features/settings/components/BrowserSettingsSection.tsx"),
      "utf8",
    );
    expect(section).toContain('t("defaultSurface.sidebar")');
    expect(section).toContain('t("defaultSurface.center")');
    expect(section).not.toContain("SIDEBAR");
    expect(section).not.toContain("CENTER TABS");
  });
});
