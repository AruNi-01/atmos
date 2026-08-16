import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("APP-059 Browser settings wiring", () => {
  it("registers browser settings section in System Integration", () => {
    const data = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings-modal-data.ts"),
      "utf8",
    );
    expect(data).toContain("sections.browser");
    expect(data).toContain("browser.agentChrome");
    expect(data).not.toContain("browser.defaultSurface");
    expect(data).toContain(
      'items: ["appearance", "account", "layout", "editor", "canvas", "terminal"] as const',
    );
    expect(data).toContain(
      'items: ["integrations", "browser", "desktop-use", "notify"] as const',
    );
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

  it("Browser page no longer owns sidebar placement or visibility", () => {
    const section = readFileSync(
      join(root, "apps/web/src/features/settings/components/BrowserSettingsSection.tsx"),
      "utf8",
    );
    expect(section).not.toContain("groups.sidebar");
    expect(section).not.toContain("newTabUrl");
    expect(section).not.toContain("links.desktopUse");
    expect(section).not.toContain("defaultSurface");
    expect(section).toContain("groups.agent");
    expect(section).toContain("BrowserCookiesSettingsCard");
    expect(section).not.toContain("downloads");
    expect(section).not.toContain("~/Downloads");
  });
});
