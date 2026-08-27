import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { MD_LIVE_HEADING_LEVELS } from "./types";
import { MD_LIVE_SLASH_GROUPS, MD_LIVE_SLASH_ITEMS } from "./slash-catalog";

const here = dirname(fileURLToPath(import.meta.url));

describe("md-live ui chrome", () => {
  test("slash catalog groups heading basic advanced media others through h6", () => {
    expect(MD_LIVE_SLASH_GROUPS.map((group) => group.id)).toEqual([
      "heading",
      "basic",
      "advanced",
      "media",
      "others",
    ]);
    expect(MD_LIVE_HEADING_LEVELS).toEqual([1, 2, 3, 4, 5, 6]);
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "h6")).toBe(true);
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "emoji")).toBe(true);
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "video")).toBe(true);
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "audio")).toBe(true);
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "inline-code")).toBe(true);
  });

  test("emoji picker uses emoji-mart data", () => {
    const picker = readFileSync(join(here, "EmojiPicker.tsx"), "utf8");
    expect(picker).toContain("@emoji-mart/data");
    expect(picker).toContain("emoji-mart");
    expect(picker).toContain("onEmojiSelect");
  });

  test("live editor dismisses slash and toolbar overlays", () => {
    const editor = readFileSync(join(here, "LiveEditor.tsx"), "utf8");
    expect(editor).toContain("setOverlayVisible");
    expect(editor).toContain("slashProvider.hide()");
    expect(editor).toContain("isMdLiveOverlayEventTarget");
    expect(editor).toContain("pointerdown");
    expect(editor).toContain("shouldShowMdLiveSelectionToolbar");
    expect(editor).toContain("slashMenu");
    expect(editor).toContain("selectionToolbar");
    expect(editor).toContain("newGroupDelay: 0");
    expect(editor).toContain("undoCommand");
  });

  test("blockquotes keep the left rule and drop typography quote marks", () => {
    const css = readFileSync(join(here, "live-editor.css"), "utf8");
    expect(css).toContain("border-left: 2px solid var(--border)");
    expect(css).toContain("quotes: none");
    expect(css).toContain("blockquote p:first-of-type::before");
    expect(css).toContain("content: none");
  });

  test("overlay selector ignores clicks outside hosts", () => {
    const selection = readFileSync(join(here, "selection.ts"), "utf8");
    expect(selection).toContain("dropdown-menu-content");
    expect(selection).toContain("isMdLiveOverlayEventTarget");
  });
});
