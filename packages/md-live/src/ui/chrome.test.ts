import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { MD_LIVE_HEADING_LEVELS } from "./types";
import { MD_LIVE_SLASH_GROUPS, MD_LIVE_SLASH_ITEMS } from "./slash-catalog";

const here = dirname(fileURLToPath(import.meta.url));

describe("md-live ui chrome", () => {
  test("slash catalog groups heading basic advanced media others through h4", () => {
    expect(MD_LIVE_SLASH_GROUPS.map((group) => group.id)).toEqual([
      "heading",
      "basic",
      "advanced",
      "media",
      "others",
    ]);
    expect(MD_LIVE_HEADING_LEVELS).toEqual([1, 2, 3, 4]);
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "h4")).toBe(true);
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "h5")).toBe(false);
    expect(MD_LIVE_SLASH_ITEMS.some((item) => item.id === "h6")).toBe(false);
    const types = readFileSync(join(here, "types.ts"), "utf8");
    expect(types).toContain("MD_LIVE_MARKDOWN_HEADING_LEVELS = [1, 2, 3, 4, 5, 6]");
    expect(types).toContain("mdLiveMarkdownHeadingLevelOf");
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
    expect(editor).not.toContain('renderSlash("")');
    expect(editor).toContain("slashRoot ??= createRoot(slashHost)");
    expect(editor).toContain("tooltipRoot ??= createRoot(tooltipHost)");
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
    expect(editor).toContain("mdLiveTableDeletePlugin");
    expect(editor).toContain("mdLiveTableViewPlugin");
    expect(editor).toContain("mdLiveDeleteTableSelection");
    expect(editor).toContain("mdLiveInlineCodePlugin");
    expect(editor).toContain("mdLiveComposingPlugin");
    expect(editor).toContain("mdLiveCommonmark");
    expect(editor).toContain("mdLiveCompositionDomHandlers");
    expect(editor).toContain("isMdLiveComposing");
    expect(editor).not.toContain(".use(commonmark)");
    const headingId = readFileSync(join(here, "heading-id.ts"), "utf8");
    expect(headingId).toContain("isMdLiveComposing");
    expect(headingId).toContain("nodeViews");
    expect(headingId).toContain("syncHeadingIdPlugin");
    expect(headingId).not.toContain("appendTransaction");
    const composing = readFileSync(join(here, "composing.ts"), "utf8");
    expect(composing).toContain("compositionstart");
    expect(composing).toContain("beforeinput");
    const inlineCode = readFileSync(join(here, "inline-code.ts"), "utf8");
    expect(inlineCode).toContain("isMdLiveComposing");
    expect(inlineCode).toContain("mdLiveCompositionDomHandlers");
    const taskList = readFileSync(join(here, "task-list.ts"), "utf8");
    expect(taskList).toContain("isMdLiveComposing");
    expect(taskList).toContain("mdLiveCompositionDomHandlers");
    const toggle = readFileSync(join(here, "toggle.ts"), "utf8");
    expect(toggle).toContain("isMdLiveComposing");
    expect(editor).toContain("mdLiveInlineCodeDelete");
    expect(editor).toContain("handleKeyDown(view, event)");
    const actions = readFileSync(join(here, "actions.ts"), "utf8");
    expect(actions).not.toContain("`code`");
    expect(actions).toContain("mdLiveInsertEmptyInlineCode");
    const tableChrome = readFileSync(join(here, "table-chrome.ts"), "utf8");
    expect(tableChrome).toContain("md-live-table-handle");
    expect(tableChrome).toContain("tableAddRowAbove");
    expect(tableChrome).toContain("tableAddColLeft");
    expect(tableChrome).toContain("add-row");
    expect(tableChrome).toContain("add-col");
    expect(tableChrome).toContain("scroll.scrollLeft");
    expect(tableChrome).toContain("wheel");
    expect(tableChrome).toContain("mdLiveTableAtScrollEnd");
    expect(tableChrome).toContain("lastColInView");
    const tableOps = readFileSync(join(here, "table-ops.ts"), "utf8");
    expect(tableOps).toContain("isMdLiveFullTableSelection");
    expect(tableOps).toContain("mdLiveDeleteTableSelection");
    expect(tableOps).toContain("isColSelection");
    expect(tableOps).toContain("isRowSelection");
    expect(tableOps).toContain('event.key !== "Delete"');
    const placeholder = readFileSync(join(here, "placeholder.ts"), "utf8");
    expect(placeholder).not.toContain("const gap");
    expect(placeholder).toContain("mdLivePlaceholderTravel");
    expect(placeholder).toContain("translate3d");
    expect(placeholder).toContain("prefers-reduced-motion");
    expect(placeholder).toContain("requestAnimationFrame");
    expect(placeholder).toContain("focusin");
    expect(placeholder).toContain("focusout");
    expect(placeholder).not.toContain("void layer.offsetWidth");
    expect(placeholder).toContain("getComputedStyle(info.nodeDOM)");
    expect(placeholder).toContain("paddingLeft");
    expect(placeholder).toContain('case "slashHeading5"');
    expect(placeholder).toContain('case "slashHeading6"');
    expect(placeholder).toContain("mdLiveMarkdownHeadingLevelOf");
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
    expect(convert).not.toContain('"h5"');
    expect(convert).not.toContain('"h6"');
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
    expect(css).toContain(".md-live-preview-code .mermaid-container img");
    expect(css).toContain("white-space: pre !important");
    expect(css).toContain("pre.shiki span.line");
    expect(css).toContain("font-size: 2.5em");
    expect(css).toContain("font-size: 1.75em");
    expect(css).toContain("font-size: 1.4em");
    expect(css).toContain("font-size: 1.2em");
    expect(css).toContain(".md-live .editor h5 {");
    expect(css).toContain("font-size: 1.1em");
    expect(css).toContain(".md-live .editor h6 {");
    expect(css).toContain("font-size: 1em");
    expect(css).toContain(".md-live-table-handle");
    expect(css).toContain(".md-live-table-add--row");
    expect(css).toContain(".md-live-table-add--col");
    expect(css).toContain("table-layout: fixed");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).not.toContain("min-width: max-content");
    expect(css).not.toContain("overscroll-behavior-x: contain");
    expect(css).toMatch(/\.md-live \.editor table \{[^}]*width: 100%;[^}]*table-layout: fixed/s);
    expect(css).toContain("border-bottom: 1px solid rgb(228 228 231)");
    expect(css).toContain(".md-live .editor tr:last-child td");
    expect(css).not.toMatch(/\.md-live \.editor th,\n\.md-live \.editor td \{\n  padding: .*;\n  border: 1px solid/);
  });

  test("overlay selector ignores clicks outside hosts", () => {
    const selection = readFileSync(join(here, "selection.ts"), "utf8");
    expect(selection).toContain("dropdown-menu-content");
    expect(selection).toContain("select-content");
    expect(selection).toContain("isMdLiveOverlayEventTarget");
    expect(selection).toContain("data-md-live-table-chrome");
  });
});
