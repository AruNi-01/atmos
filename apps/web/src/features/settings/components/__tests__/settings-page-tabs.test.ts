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
    expect(modal).toContain("<ScrollArea scrollFade className=\"size-full\">");
    const sidebar = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings-modal-sidebar.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("<ScrollArea scrollFade className=\"h-full\"");
    expect(sidebar).not.toContain("overflow-y-auto");
    expect(modal).toContain("useSettingsGroupTab");
    expect(modal).toContain("resolveSettingsTab");
    expect(modal).not.toContain("?? 'interface'");
    expect(modal).not.toContain("text-[28px]");
  });

  it("splits stacked settings groups instead of rendering them together", () => {
    const sections = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModalSections.tsx"),
      "utf8",
    );
    expect(sections).toContain("activeGroupTab");
    expect(sections).toContain("case 'integrations':");
    expect(sections).toContain("case 'browser':");
    expect(sections).toContain("case 'desktop-use':");
    expect(sections).not.toContain("activeGroupTab === 'browser'");
    expect(sections).not.toContain("activeGroupTab === 'desktop-use'");
    expect(sections).not.toContain("case 'apps'");
    expect(sections).toContain("activeGroupTab === 'tunnel-connector'");
    expect(sections).toContain("activeGroupTab === 'labels'");
    expect(sections).toContain("case 'canvas':");
    expect(sections).not.toContain("activeGroupTab === 'canvas'");
    expect(sections).toContain("<AppearanceSettingsSection />");
    expect(sections).toContain("<SettingsAboutSection");
    expect(sections).toContain("<ExperimentSettingsSection />");
    expect(sections).not.toContain("activeGroupTab === 'about'");
    expect(sections).not.toContain("activeGroupTab === 'experiments'");
    expect(sections).toContain("SettingsPageStack");
    expect(sections).not.toContain("NestedSettingsSection");
  });

  it("highlights collapsible heading text on hover", () => {
    const card = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings/SettingsGroupCard.tsx"),
      "utf8",
    );
    const agents = readFileSync(
      join(root, "apps/web/src/features/settings/components/CodeAgentSettingsSection.tsx"),
      "utf8",
    );
    const indicators = readFileSync(
      join(
        root,
        "apps/web/src/features/settings/components/AgentActivityIndicatorsSettingsSection.tsx",
      ),
      "utf8",
    );
    expect(card).toContain("group-hover:text-foreground");
    expect(card).toContain("hover:text-foreground");
    expect(agents).toContain("settingsCollapsibleTitleClassName");
    expect(agents).toContain("settingsCollapsibleChevronTriggerClassName");
    expect(indicators).toContain("settingsCollapsibleTitleClassName");
    expect(indicators).toContain("settingsCollapsibleChevronTriggerClassName");
  });
});
