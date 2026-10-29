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
    const source = readFileSync(join(import.meta.dir, "../md-live-adapters.ts"), "utf8");
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
    expect(source).toContain("@atmos/md-live/ui");
    expect(source).toContain("MdLiveEditor");
    expect(source).toContain("mdLiveEmbedBlock");
    expect(slash).toContain("MdLiveEmbedPicker");
    expect(slash).toContain("github-issue");
    expect(slash).toContain("github-pr");
    expect(slash).toContain("embed={mode}");
    expect(slash).toContain("AnimatePresence");
    expect(slash).toContain("rounded-2xl");
    expect(toolbar).toContain("rounded-xl");
    expect(slash).toContain("scrollFade");
    const picker = readFileSync(join(import.meta.dir, "../../embeds/picker.tsx"), "utf8");
    expect(picker).toContain("scrollFade");
    expect(picker).toContain("h-8");
    expect(slash).toContain("onKeepSlash");
    expect(slash).toContain("scrollActiveListItemIntoView");
    const registry = readFileSync(join(import.meta.dir, "../../embeds/registry.ts"), "utf8");
    expect(registry).toContain("resolveMdLiveEmbed");
    expect(registry).toContain("github-issue");
    expect(registry).toContain("github-pr");
    expect(registry).toContain('kind: "file"');
    expect(registry).toContain('kind: "folder"');
    const chrome = readFileSync(join(import.meta.dir, "../../embeds/chrome.tsx"), "utf8");
    expect(chrome).not.toContain("inset-y-2 left-0");
    expect(chrome).toContain("flex min-w-0 items-center gap-1.5");
    const pathEmbed = readFileSync(join(import.meta.dir, "../../embeds/path-embed.tsx"), "utf8");
    expect(pathEmbed).toContain("MdLivePathIcon");
    const pathIcon = readFileSync(join(import.meta.dir, "../../embeds/path-icon.tsx"), "utf8");
    expect(pathIcon).toContain("getFileIconProps");
    const embedNodes = readFileSync(join(import.meta.dir, "../md-live-embed-nodes.ts"), "utf8");
    expect(embedNodes).toContain("remarkUnknownMdast");
    const plugin = readFileSync(join(import.meta.dir, "../md-live-embed-plugin.tsx"), "utf8");
    expect(plugin).toContain("resolveMdLiveEmbed");
    expect(plugin).toContain("selectNode");
    expect(embedNodes).toContain("restoreUnknownTextDirective");
    expect(embedNodes).toContain("restoreUnknownReference");
    expect(embedNodes).toContain("linkReference");
    expect(source).toContain("slashMenu={slashMenu}");
    expect(source).toContain("selectionToolbar={MdLiveSelectionToolbar}");
    expect(source).toContain("onOpenMedia");
    expect(source).toContain("enableMedia");
    expect(source).toContain("enableAi");
    expect(source).toContain("embedded");
    expect(source).toContain("autoFocus");
    expect(source).toContain("hiddenGroups");
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
    const blocks = readFileSync(join(import.meta.dir, "../md-live-preview-blocks.tsx"), "utf8");
    expect(blocks).toContain("CodeBlockHeader");
    expect(blocks).toContain("CodeBlockContent");
    expect(blocks).toContain("MARKDOWN_TABLE_TH_CLASS");
    expect(blocks).toContain("CopyButton");
    expect(blocks).toContain("tableHeaderRowSchema");
    expect(blocks).toContain("codeBlockSchema");
    expect(blocks).toContain("CodeLanguagePicker");
    expect(blocks).not.toContain("CommandInput");
    expect(blocks).toContain("setNodeMarkup");
    expect(blocks).toContain("isMdLiveComposing");
    expect(blocks).toContain("onLanguageChange");
    expect(blocks).toContain("isMermaidFenceLanguage");
    expect(blocks).toContain("MermaidModeSwitch");
    expect(blocks).toContain("MermaidPreviewPane");
    expect(blocks).toMatch(/const SHIKI_LANGS = new Set\(\[[\s\S]*?"mermaid"/);
    expect(blocks).not.toContain(
      "if (isMermaidFenceLanguage(language)) {\n      overlay.replaceChildren()",
    );
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
    expect(slash).toContain("hiddenGroups");
    expect(slash).not.toContain("slashFilter");
    expect(slash).not.toContain("onMouseEnter={() => setSelectedIndex");
    expect(toolbar).toContain("DropdownMenu");
    expect(toolbar).toContain("DropdownMenuContent");
    expect(toolbar).toContain("activeBlockId");
    expect(toolbar).toContain("convertIds");
    expect(toolbar).toContain("toolbarOrderedList");
    expect(toolbar).toContain("mdLiveMarkdownHeadingLevelOf");
    expect(toolbar).toContain("/^h([1-6])$/");
    expect(toolbar).toContain("slashToggle");
    expect(toolbar).toContain("data-selected");
    expect(toolbar).toContain("aria-current");
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
    const source = readFileSync(join(import.meta.dir, "../../embeds/open-embed.ts"), "utf8");
    expect(source).toContain("openIssue");
    expect(source).toContain("openPullRequest");
    expect(source).toContain("activateCenterChromeTab");
  });

  test("Live Agent Chat reuses one Agent Chat session for popover and bottom bar", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/MdLiveAgentChat.tsx"),
      "utf8",
    );
    expect(source.match(/useAgentChatSession\(/g)?.length).toBe(1);
    expect(source).toContain("mdLiveAgentChatInstanceKey");
    expect(source).toContain("instanceKey={instanceKey}");
    expect(source).toContain("AgentPromptComposer");
    expect(source).toContain("AgentChatTranscriptList");
    expect(source).toContain("data-md-live-agent-placement={placement}");
    expect(source).toContain('placement === "popover"');
    expect(source).toContain("data-md-live-agent-popover");
    expect(source).toContain("data-md-live-agent-bar");
    expect(source).toContain("data-md-live-working-pill");
    expect(source).toContain("setExpanded(true)");
    expect(source).toContain("setExpanded(false)");
    expect(source).toContain("data-md-live-accept");
    expect(source).toContain("data-md-live-reject");
    expect(source).toContain("insertFileMentionForInstanceKey");
    expect(source).toContain("onDraftChange");
    expect(source).toContain("mdLiveSelectionPopoverStyle");
    expect(source).toContain("nextMdLiveBarMode");
    expect(source).toContain("insertAiContextForInstanceKey");
    expect(source).toContain('"doc-selection"');
    expect(source).not.toContain("MD_LIVE_HEADLESS_PTY");
    expect(source).not.toContain("createFenceExtractor");
    expect(source).not.toContain("Send to terminal");
    expect(source).toContain("useMdLiveAgentBridge");
    const bridge = readFileSync(
      join(import.meta.dir, "../../hooks/use-md-live-agent-bridge.ts"),
      "utf8",
    );
    expect(bridge).toContain("applyMdLiveAgentToolToOpenDoc");
    expect(bridge).toContain("md_live_agent_dispatch");
    const host = readFileSync(join(import.meta.dir, "../md-live-edit-host.ts"), "utf8");
    expect(host).toContain("isMdLiveMutatingTool");
    expect(host).not.toContain("fs_write");
  });

  test("headless dock is unmounted as the primary Live Agent path", () => {
    const chat = readFileSync(
      join(import.meta.dir, "../../components/MdLiveAgentChat.tsx"),
      "utf8",
    );
    const dock = readFileSync(
      join(import.meta.dir, "../../components/MdLiveAgentDock.tsx"),
      "utf8",
    );
    expect(chat).not.toContain("MdLiveAgentDock");
    expect(dock).toContain("MD_LIVE_HEADLESS_PTY");
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
