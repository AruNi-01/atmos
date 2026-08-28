import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("composer slash command icons", () => {
  it("wires Browser Use and Desktop Use glyphs in SlashCommandPopover", () => {
    const popover = readFileSync(
      join(
        root,
        "apps/web/src/features/welcome/components/SlashCommandPopover.tsx",
      ),
      "utf8",
    );
    expect(popover).toContain("BrowserUseIconStatic");
    expect(popover).toContain("DesktopUseIconStatic");
    expect(popover).toContain("BROWSER_USE_SLASH_COMMAND_ID");
    expect(popover).toContain("DESKTOP_USE_SLASH_COMMAND_ID");
    expect(popover).toContain(
      'command.id === BROWSER_USE_SLASH_COMMAND_ID',
    );
    expect(popover).toContain(
      'command.id === DESKTOP_USE_SLASH_COMMAND_ID',
    );
    expect(popover).toContain("<Zap className=\"size-4\" />");
    expect(popover).not.toContain("MessageCirclePlus");
  });

  it("Browser Use static icon is app-window + pointer (not monitor)", () => {
    const icon = readFileSync(
      join(
        root,
        "packages/ui/src/components/icons/browser-use-icon-static.tsx",
      ),
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
      join(
        root,
        "packages/ui/src/components/icons/desktop-use-icon-static.tsx",
      ),
      "utf8",
    );
    expect(icon).toContain("DesktopUseIconStatic");
    expect(icon).toContain("M13 3H4a2 2 0 0 0-2 2v10");
    expect(icon).toContain("M8 21h8");
    expect(icon).toContain("translate(22.6 0.2) scale(-0.48 0.48)");
  });
});
