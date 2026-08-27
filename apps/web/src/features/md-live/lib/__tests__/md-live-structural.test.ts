import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("md-live structural gates", () => {
  test("github and code-review do not import the live editor", () => {
    const github = readFileSync(
      join(import.meta.dir, "../../../github/lib/pr-detail-parts.tsx"),
      "utf8",
    );
    expect(github).not.toContain("MarkdownLiveEditor");
    expect(github).toContain("MarkdownRenderer");
  });

  test("adapters are copy and headless only", () => {
    const source = readFileSync(
      join(import.meta.dir, "../md-live-adapters.ts"),
      "utf8",
    );
    expect(source).toContain("copyMdLivePrompt");
    expect(source).toContain("buildHeadlessPrompt");
    expect(source).not.toContain("terminal-current");
    expect(source).not.toContain("terminal_input");
  });

  test("web host wraps package editor and supplies design-system slash/toolbar", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/MarkdownLiveEditor.tsx"),
      "utf8",
    );
    const slash = readFileSync(
      join(import.meta.dir, "../../components/MdLiveSlashMenu.tsx"),
      "utf8",
    );
    const toolbar = readFileSync(
      join(import.meta.dir, "../../components/MdLiveSelectionToolbar.tsx"),
      "utf8",
    );
    expect(source).toContain('@atmos/md-live/ui');
    expect(source).toContain("MdLiveEditor");
    expect(source).toContain("mdLiveEmbedBlock");
    expect(source).toContain("slashMenu={MdLiveSlashMenu}");
    expect(source).toContain("selectionToolbar={MdLiveSelectionToolbar}");
    expect(source).toContain("onOpenMedia");
    expect(source).toContain("mdLiveMediaViewPlugin");
    expect(source).toContain("mdLivePreviewBlockPlugins");
    expect(source).toContain("defaultToggleOpen");
    expect(source).toContain("setToggleDefaultOpen");
    expect(source).toContain("mdToggleDefaultOpen");
    const tabBar = readFileSync(
      join(import.meta.dir, "../../../../app-shell/CenterStageTabBar.tsx"),
      "utf8",
    );
    expect(tabBar).toContain("onCreateMarkdownNote");
    expect(tabBar).toContain("newMarkdown");
    expect(tabBar).toContain("openUntitledMarkdown");
    const blocks = readFileSync(
      join(import.meta.dir, "../md-live-preview-blocks.tsx"),
      "utf8",
    );
    expect(blocks).toContain("CodeBlockHeader");
    expect(blocks).toContain("CodeBlockContent");
    expect(blocks).toContain("MARKDOWN_TABLE_WRAP_CLASS");
    expect(blocks).toContain("CopyButton");
    expect(blocks).toContain("tableSchema");
    expect(blocks).toContain("codeBlockSchema");
    expect(blocks).toContain("CodeLanguagePicker");
    expect(blocks).not.toContain("CommandInput");
    expect(blocks).toContain("setNodeMarkup");
    expect(blocks).toContain("onLanguageChange");
    expect(blocks).not.toContain("@milkdown/components/code-block");
    expect(source).not.toContain("slashFactory");
    expect(slash).toContain("CommandItem");
    expect(slash).toContain("ArrowDown");
    expect(slash).toContain("slashOverlayIsOpen");
    expect(slash).toContain("scrollActiveListItemIntoView");
    expect(slash).toContain("disablePointerSelection");
    expect(slash).toContain("itemRefs.current, selectedIndex, 3");
    expect(slash).toContain('kind: "open"');
    expect(slash).toContain("ListCollapse");
    expect(slash).toContain('id === "toggle"');
    expect(slash).not.toContain("slashFilter");
    expect(slash).not.toContain("onMouseEnter={() => setSelectedIndex");
    expect(toolbar).toContain("DropdownMenu");
    expect(toolbar).toContain("DropdownMenuContent");
    expect(toolbar).toContain("Tooltip");
    expect(toolbar).toContain("TooltipContent");
    expect(toolbar).toContain("TooltipProvider");
    const settings = readFileSync(
      join(import.meta.dir, "../../../settings/components/EditorSettingsSection.tsx"),
      "utf8",
    );
    expect(settings).toContain("expandToggles");
    expect(settings).toContain("mdToggleDefaultOpen");
  });

  test("github embed open uses the native center tab", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../embeds/open-embed.ts"),
      "utf8",
    );
    expect(source).toContain("openIssue");
    expect(source).toContain("openPullRequest");
    expect(source).toContain("activateCenterChromeTab");
  });

  test("composer dock reuses PromptComposer and has no terminal send", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/MdLiveAgentDock.tsx"),
      "utf8",
    );
    expect(source).toContain("PromptComposer");
    expect(source).toContain("@/features/welcome/components/PromptComposer");
    expect(source).toContain("WelcomeAgentSelector");
    expect(source).toContain("filterHeadlessAgents");
    expect(source).toContain('triggerPlacement="inline"');
    expect(source).toContain('purpose="automation"');
    expect(source).not.toContain('variant="menu"');
    expect(source).toContain('placeholder={t("placeholder")}');
    expect(source).toContain("ArrowUp");
    expect(source).not.toContain("copyMdLivePrompt");
    expect(source).not.toContain("Send to terminal");
    expect(source).not.toContain("EditorPromptComposer");
    expect(source).not.toContain("{t(\"run\")}\n        </Button>");
    expect(source).toContain("isTerminalAgentInputShortcut");
    expect(source).toContain("h-1 w-28 rounded-full");
    expect(source).toContain("pointer-events-none absolute inset-x-0 bottom-1.5");
    expect(source).toContain("grid-rows-[0fr]");
    expect(source).toContain("grid-rows-[1fr]");
    expect(source).toContain("MD_LIVE_HEADLESS_PTY");
    expect(source).toContain("connectWhileHidden");
    expect(source).toContain("shouldFireMdLiveFenceTimeout");
    expect(source).toContain("stripTerminalAnsi");
    expect(source).toContain("resolveMdLiveRunEditor");
    expect(source).toContain("resolveMdLiveRunGrid");
    const onRun = source.slice(source.indexOf("const onRun"));
    expect(onRun.indexOf("resolveMdLiveRunEditor")).toBeGreaterThan(-1);
    expect(onRun.indexOf("resolveMdLiveRunGrid")).toBeGreaterThan(-1);
    expect(onRun.indexOf("resolveMdLiveRunEditor")).toBeLessThan(onRun.indexOf("lockMdLiveStream"));
    expect(onRun.indexOf("resolveMdLiveRunGrid")).toBeLessThan(onRun.indexOf("lockMdLiveStream"));
    expect(source).toContain("restoreAndUnlockMdLiveStream");
  });

  test("terminal grid handle is published from the frame callback ref", () => {
    const frame = readFileSync(
      join(import.meta.dir, "../../../../app-shell/workspace-center-frame.tsx"),
      "utf8",
    );
    const stage = readFileSync(
      join(import.meta.dir, "../../../../app-shell/CenterStage.tsx"),
      "utf8",
    );
    expect(frame).toContain("registerMdLiveTerminalGrid");
    expect(frame).toContain("publishMdLiveTerminalGrid");
    expect(stage).not.toContain("useLayoutEffect(() => {\n    registerMdLiveTerminalGrid");
  });

  test("hidden headless PTY connects without FitAddon on an inactive grid", () => {
    const terminal = readFileSync(
      join(import.meta.dir, "../../../terminal/components/Terminal.tsx"),
      "utf8",
    );
    expect(terminal).toContain("shouldConnectHiddenPty");
    expect(terminal).toContain("HIDDEN_PTY_CONNECT_GRID");
    expect(terminal).toContain("connectWhileHidden");
  });
});
