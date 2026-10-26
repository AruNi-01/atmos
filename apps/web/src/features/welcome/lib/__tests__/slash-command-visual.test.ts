import { describe, expect, it } from "bun:test";
import { VIEW_RUN_LOGS_SLASH_COMMAND_ID } from "@/features/browser/lib/run-log-context";
import { DEVICE_PREVIEW_SLASH_COMMAND_ID } from "@/features/simulator/lib/device-preview-agent-prompt";
import { BROWSER_USE_SLASH_COMMAND_ID } from "@/features/welcome/lib/slash-browser-use";
import { DESKTOP_USE_SLASH_COMMAND_ID } from "@/features/welcome/lib/slash-desktop-use";
import {
  DEFAULT_SLASH_COMMAND_VISUAL,
  DYNAMIC_SKILLS_SLASH_COMMAND_ID,
  SIDE_SLASH_COMMAND_ID,
  SLASH_COMMAND_GLYPH_NODES,
  SPAWN_SLASH_COMMAND_ID,
  slashCommandChipToneClass,
  slashCommandListToneClass,
  slashCommandVisual,
  slashSkillVisual,
  slashVisualForAiContextKind,
} from "@/features/welcome/lib/slash-command-visual";

describe("slash command visual catalog", () => {
  it("maps atmos command ids to the picker glyph and tone", () => {
    expect(slashCommandVisual(BROWSER_USE_SLASH_COMMAND_ID)).toEqual({
      glyph: "browser-use",
      tone: "amber",
    });
    expect(slashCommandVisual(DESKTOP_USE_SLASH_COMMAND_ID)).toEqual({
      glyph: "desktop-use",
      tone: "violet",
    });
    expect(slashCommandVisual(VIEW_RUN_LOGS_SLASH_COMMAND_ID)).toEqual({
      glyph: "scroll-text",
      tone: "emerald",
    });
    expect(slashCommandVisual(DEVICE_PREVIEW_SLASH_COMMAND_ID)).toEqual({
      glyph: "smartphone",
      tone: "cyan",
    });
    expect(slashCommandVisual(DYNAMIC_SKILLS_SLASH_COMMAND_ID)).toEqual({
      glyph: "eye-off",
      tone: "red",
    });
    expect(slashCommandVisual(SPAWN_SLASH_COMMAND_ID)).toEqual({
      glyph: "messages-square",
      tone: "green",
    });
    expect(slashCommandVisual(SIDE_SLASH_COMMAND_ID)).toEqual({
      glyph: "message-circle-plus",
      tone: "cyan",
    });
  });

  it("falls back to zap for agent / unknown command names", () => {
    expect(slashCommandVisual("copy-request-id")).toEqual(DEFAULT_SLASH_COMMAND_VISUAL);
    expect(slashCommandVisual("compact")).toEqual(DEFAULT_SLASH_COMMAND_VISUAL);
  });

  it("maps atmos skill paths onto the same command visuals", () => {
    expect(
      slashSkillVisual("~/.atmos/skills/.system/atmos-browser-use", "atmos-browser-use"),
    ).toEqual(slashCommandVisual(BROWSER_USE_SLASH_COMMAND_ID));
    expect(slashSkillVisual("/tmp/atmos-desktop-use/SKILL.md")).toEqual(
      slashCommandVisual(DESKTOP_USE_SLASH_COMMAND_ID),
    );
    expect(slashSkillVisual("~/.atmos/skills/.system/atmos-device-preview/SKILL.md")).toEqual(
      slashCommandVisual(DEVICE_PREVIEW_SLASH_COMMAND_ID),
    );
    expect(slashSkillVisual("/tmp/other-skill", "other-skill")).toBeNull();
  });

  it("maps slash-originated AI context kinds onto the same visuals", () => {
    expect(slashVisualForAiContextKind("run-log")).toEqual(
      slashCommandVisual(VIEW_RUN_LOGS_SLASH_COMMAND_ID),
    );
    expect(slashVisualForAiContextKind("device-preview")).toEqual(
      slashCommandVisual(DEVICE_PREVIEW_SLASH_COMMAND_ID),
    );
    expect(slashVisualForAiContextKind("code-selection")).toBeNull();
  });

  it("pairs list icon color with chip accent for each tone", () => {
    expect(slashCommandListToneClass("amber")).toContain("text-amber-600");
    expect(slashCommandChipToneClass("amber")).toContain("text-amber-700");
    expect(slashCommandListToneClass("emerald")).toContain("text-emerald-600");
    expect(slashCommandChipToneClass("emerald")).toContain("text-emerald-700");
    expect(slashCommandListToneClass("cyan")).toContain("text-cyan-600");
    expect(slashCommandChipToneClass("cyan")).toContain("text-cyan-700");
    expect(slashCommandListToneClass("violet")).toContain("text-violet-600");
    expect(slashCommandChipToneClass("violet")).toContain("text-violet-700");
    expect(slashCommandListToneClass("red")).toContain("text-red-600");
    expect(slashCommandChipToneClass("red")).toContain("text-red-700");
  });

  it("keeps Browser Use / Desktop Use / ScrollText / Smartphone path identity", () => {
    const browser = SLASH_COMMAND_GLYPH_NODES["browser-use"];
    expect(browser.some((node) => node.type === "path" && node.d.startsWith("M12 4H4"))).toBe(true);
    expect(
      browser.some(
        (node) => node.type === "g" && node.transform === "translate(23.4 2.0) scale(-0.45 0.45)",
      ),
    ).toBe(true);

    const desktop = SLASH_COMMAND_GLYPH_NODES["desktop-use"];
    expect(desktop.some((node) => node.type === "path" && node.d.startsWith("M13 3H4"))).toBe(true);
    expect(desktop.some((node) => node.type === "path" && node.d === "M8 21h8")).toBe(true);

    const scroll = SLASH_COMMAND_GLYPH_NODES["scroll-text"];
    expect(scroll.some((node) => node.type === "path" && node.d === "M15 12h-5")).toBe(true);

    const phone = SLASH_COMMAND_GLYPH_NODES.smartphone;
    expect(
      phone.some((node) => node.type === "rect" && node.width === 14 && node.height === 20),
    ).toBe(true);
  });
});
