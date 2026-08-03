import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("Desktop Use settings wiring", () => {
  it("registers desktop-use settings section and group", () => {
    const data = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings-modal-data.ts"),
      "utf8",
    );
    expect(data).toContain('"desktop-use"');
    expect(data).toContain("sections.desktopUse");
  });

  it("includes desktop-use in SettingsModalTab enum list", () => {
    const params = readFileSync(
      join(root, "apps/web/src/shared/lib/nuqs/searchParams.ts"),
      "utf8",
    );
    expect(params).toContain('"desktop-use"');
  });

  it("SettingsModalSections renders DesktopUseSettingsSection", () => {
    const sections = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModalSections.tsx"),
      "utf8",
    );
    expect(sections).toContain("DesktopUseSettingsSection");
    expect(sections).toContain("case 'desktop-use'");
  });

  it("Desktop Use section embeds AppshotPermissionsPanel", () => {
    const section = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/DesktopUseSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(section).toContain("AppshotPermissionsPanel");
    expect(section.toLowerCase()).not.toContain("cua");
    expect(section.toLowerCase()).not.toContain("trycua");
  });

  it("permission primary path opens Settings Desktop Use", () => {
    const client = readFileSync(
      join(root, "apps/web/src/features/appshot/lib/appshot-client.ts"),
      "utf8",
    );
    expect(client).toContain("openDesktopUseSettingsInApp");
    expect(client).toContain("Desktop Use");
  });
});
