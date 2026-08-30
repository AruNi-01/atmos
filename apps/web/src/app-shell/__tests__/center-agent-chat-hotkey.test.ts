import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCenterAgentChatHotkeyAction } from "@/app-shell/center-agent-chat-hotkey";

describe("resolveCenterAgentChatHotkeyAction", () => {
  it("focuses the active chat tab in the focused pane", () => {
    expect(
      resolveCenterAgentChatHotkeyAction({
        tabIds: ["terminal", "agent-chat:one"],
        activeTabId: "agent-chat:one",
      }),
    ).toEqual({ action: "focus", tabId: "agent-chat:one" });
  });

  it("activates an existing chat tab instead of creating another", () => {
    expect(
      resolveCenterAgentChatHotkeyAction({
        tabIds: ["terminal", "agent-chat:one", "files"],
        activeTabId: "terminal",
      }),
    ).toEqual({ action: "activate", tabId: "agent-chat:one" });
  });

  it("creates a chat tab when the focused pane has none", () => {
    expect(
      resolveCenterAgentChatHotkeyAction({
        tabIds: ["terminal", "files"],
        activeTabId: "terminal",
      }),
    ).toEqual({ action: "create" });
    expect(resolveCenterAgentChatHotkeyAction(null)).toEqual({ action: "create" });
  });
});

describe("center agent chat composer hotkey wiring", () => {
  it("binds ⌘L to the center region in CenterStage", () => {
    const support = readFileSync(
      join(import.meta.dir, "../use-center-agent-chat-composer-hotkey.ts"),
      "utf8",
    );
    const stage = readFileSync(join(import.meta.dir, "../CenterStage.tsx"), "utf8");
    expect(support).toContain('"mod+l"');
    expect(support).toContain("isCenterStageHotkeyTarget");
    expect(support).toContain("CENTER_REGION_DIGIT_HOTKEY_OPTIONS");
    expect(stage).toContain("useCenterAgentChatComposerHotkey");
  });
});
