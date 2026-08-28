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
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "toggle")).toBe(true);
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
    expect(editor).toContain("mdLiveSelectionBlockKindId");
    expect(editor).toContain("mdLiveVisibleConvertIds");
    expect(editor).toContain("activeBlockId");
    expect(editor).toContain("convertIds");
    expect(editor).toContain("slashMenu");
    expect(editor).toContain("selectionToolbar");
    expect(editor).toContain("newGroupDelay: 0");
    expect(editor).toContain("undoCommand");
    expect(editor).toContain('spellcheck: "false"');
    expect(editor).toContain("editorViewOptionsCtx");
    expect(editor).toContain("applyMdLiveRemarkConfig");
    expect(editor).toContain("formatMdLiveSerializedMarkdown");
    expect(editor).toContain("commitMarkdown.arm()");
    expect(editor).toContain("focusEditorCaret");
    expect(editor).toContain("mdLiveTogglePlugins");
    expect(editor).toContain("mdLivePlaceholderPlugin");
    expect(editor).toContain("mdLiveBlockBackspacePlugin");
    const placeholder = readFileSync(join(here, "placeholder.ts"), "utf8");
    expect(placeholder).not.toContain("const gap");
    expect(placeholder).toContain("mdLivePlaceholderTravel");
    expect(placeholder).toContain("translate3d");
    expect(placeholder).toContain("prefers-reduced-motion");
    expect(placeholder).toContain("requestAnimationFrame");
    expect(placeholder).toContain("focusin");
    expect(placeholder).toContain("focusout");
    expect(placeholder).not.toContain("void layer.offsetWidth");
    expect(placeholder).not.toContain("getComputedStyle(info.nodeDOM)");
    const backspace = readFileSync(join(here, "block-backspace.ts"), "utf8");
    expect(backspace).toContain('key: "Backspace"');
    expect(backspace).toContain("priority: 100");
    expect(backspace).toContain("isInputRules");
    expect(backspace).not.toContain('key: "Delete"');
    expect(editor).toContain("defaultToggleOpen");
    expect(editor).toContain("setToggleDefaultOpen");
    expect(editor).toContain("applyMdLiveToggleDefaultOpen");
    const convert = readFileSync(join(here, "convert-block.ts"), "utf8");
    expect(convert).toContain("isolateSelectedTextblock");
    expect(convert).toContain("MD_LIVE_TOOLBAR_CONVERT_IDS");
    expect(convert).toContain('"toggle"');
  });

  test("stringify uses hyphen bullets, tight lists, and compact tables", () => {
    const stringify = readFileSync(join(here, "markdown-stringify.ts"), "utf8");
    expect(stringify).toContain('bullet: "-"');
    expect(stringify).toContain('listItemIndent: "one"');
    expect(stringify).toContain("tablePipeAlign: false");
    expect(stringify).toContain("tableCellPadding: true");
    expect(stringify).toContain("formatMdLiveSerializedMarkdown");
    expect(stringify).toContain("applyMdLiveRemarkConfig");
    expect(stringify).toContain("stringifyMdLiveDetails");
    expect(stringify).toContain("<details>");
    expect(stringify).toContain("<summary>");
    const tasks = readFileSync(join(here, "task-list.ts"), "utf8");
    expect(tasks).toContain("spread: { default: false");
    expect(tasks).toContain("const spread = node.spread ?? false");
    expect(tasks).toContain("mdLiveTaskMarkerOf(node.attrs) == null");
  });

  test("blockquotes keep the left rule and drop typography quote marks", () => {
    const css = readFileSync(join(here, "live-editor.css"), "utf8");
    expect(css).toContain("min-height: 100%");
    expect(css).toContain("ProseMirror-trailingBreak");
    expect(css).toContain("min-height: 1.75em");
    expect(css).toContain("border-left: 2px solid var(--border)");
    expect(css).toContain("quotes: none");
    expect(css).toContain("blockquote p:first-of-type::before");
    expect(css).toContain("content: none");
  });

  test("task checks sit on the first text line and use overview tones", () => {
    const css = readFileSync(join(here, "live-editor.css"), "utf8");
    expect(css).toContain("height: 1.75em");
    expect(css).toContain(".md-live-task-icon.is-active");
    expect(css).toContain(".md-live-task-check--progress");
    expect(css).toContain(".md-live-task-check--done");
    expect(css).toContain("li.md-live-task-item p");
    expect(css).toContain(".md-live-toggle-chevron-icon");
    expect(css).toContain(".md-live-placeholder-label.is-visible");
    expect(css).toContain(".md-live-placeholder-morph");
    expect(css).toContain(".md-live-placeholder-label.is-enter");
    expect(css).toContain(".md-live-placeholder-label.is-leave");
    expect(css).toContain("align-items: center");
    expect(css).toContain("line-height: 1");
    expect(css).toContain("transform 200ms ease-out");
    expect(css).toContain("opacity 160ms ease-out");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".md-live .editor pre.md-live-preview-code-editor");
    expect(css).toContain("white-space: pre !important");
    expect(css).toContain("pre.shiki span.line");
  });

  test("overlay selector ignores clicks outside hosts", () => {
    const selection = readFileSync(join(here, "selection.ts"), "utf8");
    expect(selection).toContain("dropdown-menu-content");
    expect(selection).toContain("isMdLiveOverlayEventTarget");
  });
});
