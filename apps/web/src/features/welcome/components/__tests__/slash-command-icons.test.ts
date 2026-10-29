import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("composer slash command icons", () => {
  it("wires shared slash-command visuals in SlashCommandPopover", () => {
    const popover = readFileSync(
      join(root, "apps/web/src/features/welcome/components/SlashCommandPopover.tsx"),
      "utf8",
    );
    expect(popover).toContain("SlashCommandGlyph");
    expect(popover).toContain("SlashCommandGlyphIcon");
    expect(popover).toContain("slashSkillVisual");
    expect(popover).not.toContain("commandId === BROWSER_USE_SLASH_COMMAND_ID");
    expect(popover).not.toContain('<Zap className="size-4" />');
    expect(popover).not.toContain("AGENT_BRIDGE_SLASH_COMMAND_ID");
    expect(popover).not.toContain("MessageCirclePlus");
    expect(popover).toContain("expandedSections.commands");
    expect(popover).toContain("expandedSections.atmosCommands");
    expect(popover).toContain("commandsTitle");
    expect(popover).toContain("atmosCommandsTitle");
    expect(popover).toContain("slashPopover.atmosCommands");
    expect(popover).toContain("<ScrollArea");
    expect(popover).toContain("scrollFade");

    const composer = readFileSync(
      join(root, "apps/web/src/features/welcome/components/PromptComposer.tsx"),
      "utf8",
    );
    expect(composer).toContain("applySlashCommandChipLook");
    expect(composer).toContain("slashCommandVisual(name)");
    expect(composer).toContain("slashSkillVisual(absolutePath, filename)");
    expect(composer).toContain("slashVisualForAiContextKind(parsed.kind)");
    expect(composer).toContain("DYNAMIC_SKILLS_SLASH_COMMAND_ID");
    expect(composer).toContain("SIDE_SLASH_COMMAND_ID");
    expect(composer).toContain("SPAWN_SLASH_COMMAND_ID");
  });

  it("uses ScrollArea fades for the @ mention list", () => {
    const mention = readFileSync(
      join(root, "apps/web/src/features/welcome/components/WelcomeMentionPopover.tsx"),
      "utf8",
    );
    expect(mention).toContain("<ScrollArea");
    expect(mention).toContain("scrollFade");
  });

  it("groups Atmos built-in commands below Agent commands", () => {
    const welcome = readFileSync(
      join(root, "apps/web/src/features/welcome/components/WelcomePage.tsx"),
      "utf8",
    );
    expect(welcome).toContain("filteredAtmosCommands: slashCommands");
    expect(welcome).toContain("showAtmosCommands: slashCommands.length > 0");
    expect(welcome).not.toContain("filteredCommands: slashCommands");

    const agent = readFileSync(
      join(root, "apps/web/src/features/agent/hooks/use-agent-composer-popovers.tsx"),
      "utf8",
    );
    expect(agent).toContain("filteredAtmosCommands={filteredAtmosCommands}");
    expect(agent).toContain("showAtmosCommands={filteredAtmosCommands.length > 0}");
    expect(agent).toContain("slashPopover.atmosCommands");
    expect(agent).toContain("buildBrowserUseSlashCommand");
    expect(agent).toContain("buildDesktopUseSlashCommand");
    expect(agent).toContain("buildAgentBridgeSlashCommand");
    expect(agent).toContain("buildViewRunLogsSlashCommand");
    expect(agent).toContain("buildDevicePreviewSlashCommand");
    expect(agent).toContain("dynamic-skills");

    const en = JSON.parse(readFileSync(join(root, "apps/web/messages/en.json"), "utf8")) as {
      Welcome: {
        components: {
          slashPopover: {
            atmosCommands: string;
            devicePreview: { label: string; description: string };
            agentBridge: { label: string; description: string };
          };
        };
      };
    };
    const zh = JSON.parse(readFileSync(join(root, "apps/web/messages/zh.json"), "utf8")) as {
      Welcome: {
        components: {
          slashPopover: {
            atmosCommands: string;
            devicePreview: { label: string; description: string };
            agentBridge: { label: string; description: string };
          };
        };
      };
    };
    expect(en.Welcome.components.slashPopover.atmosCommands).toBe("Atmos built-in commands");
    expect(en.Welcome.components.slashPopover.devicePreview.label).toBe("Simulator Device Use");
    expect(en.Welcome.components.slashPopover.agentBridge.label).toBe("Agent Bridge");
    expect(en.Welcome.components.slashPopover.agentBridge.description).toBe(
      "Address other agents on this Computer (list, send, request)",
    );
    expect(en.Welcome.components.slashPopover.devicePreview.description).toBe(
      "Let the agent use this workspace's simulator device",
    );
    expect(zh.Welcome.components.slashPopover.atmosCommands).toBe("Atmos 内置命令");
    expect(zh.Welcome.components.slashPopover.devicePreview.label).toBe("Simulator Device Use");
    expect(zh.Welcome.components.slashPopover.devicePreview.description).toBe(
      "让 Agent 使用当前工作区的模拟器设备",
    );
    expect(zh.Welcome.components.slashPopover.agentBridge.label).toBe("Agent Bridge");
    expect(zh.Welcome.components.slashPopover.agentBridge.description).toBe(
      "给本机其他 Agent 发消息（目录、发送、请求）",
    );
  });

  it("Browser Use static icon is app-window + pointer (not monitor)", () => {
    const icon = readFileSync(
      join(root, "packages/ui/src/components/icons/browser-use-icon-static.tsx"),
      "utf8",
    );
    expect(icon).toContain("BrowserUseIconStatic");
    // Title-bar chrome (browser window), not desktop stand
    expect(icon).toContain("M12 4H4a2 2 0 0 0-2 2v12");
    expect(icon).toContain("M2 8h10");
    expect(icon).not.toContain("M8 21h8");
    // Pointer inset from window top edge (gap vs desktop-style spacing)
    expect(icon).toContain("translate(23.4 2.0) scale(-0.45 0.45)");
  });

  it("Desktop Use static icon remains monitor + pointer", () => {
    const icon = readFileSync(
      join(root, "packages/ui/src/components/icons/desktop-use-icon-static.tsx"),
      "utf8",
    );
    expect(icon).toContain("DesktopUseIconStatic");
    expect(icon).toContain("M13 3H4a2 2 0 0 0-2 2v10");
    expect(icon).toContain("M8 21h8");
    expect(icon).toContain("translate(22.6 0.2) scale(-0.48 0.48)");
  });
});
