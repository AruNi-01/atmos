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
    expect(source).toContain('chatIdProp || ""');
    expect(source).toContain("selectedId={selectedSubagentId}");
    expect(source).toContain("onSelect={setSelectedSubagentId}");
    expect(source).toContain("mdLiveAgentChatInstanceKey");
    expect(source).toContain("instanceKey={instanceKey}");
    expect(source).toContain("chatSource: MD_LIVE_AGENT_CHAT_SOURCE");
    const session = readFileSync(
      join(import.meta.dir, "../../../agent/hooks/use-agent-chat-session.ts"),
      "utf8",
    );
    expect(session).toContain("persistRequestedChatSource");
    expect(session).toContain("chatSource: requestedSource");
    expect(session).toContain("configure(id, { source: requestedSource })");
    const api = readFileSync(join(import.meta.dir, "../../../../api/ws/agent-chat-api.ts"), "utf8");
    expect(api).toContain("filterDefaultHiddenAgentChatItems");
    expect(api).toContain("input.exclude_sources");
    expect(source).toContain("AgentPromptComposer");
    expect(source).toContain("AgentChatTranscriptList");
    expect(source).toContain("data-md-live-agent-placement={placement}");
    expect(source).toContain('placement === "popover"');
    expect(source).toContain("data-md-live-agent-popover");
    expect(source).toContain("data-md-live-agent-bar");
    expect(source).toContain("data-md-live-message-agent");
    expect(source).toContain('t("messageAgent")');
    expect(source).toContain("LayoutGroup");
    expect(source).toContain("layoutId={MD_LIVE_INVITE_LAYOUT_ID}");
    expect(source).toContain("data-md-live-invite-hairline");
    expect(source).toContain("MD_LIVE_INVITE_HAIRLINE_WIDTH_PX");
    expect(source).toContain("flex justify-center pb-3");
    expect(source).not.toContain('className="h-0.5 w-full rounded-full"');
    expect(source).toContain("mdLiveInviteMorphs");
    expect(source).toContain("mdLiveBarSurface");
    expect(source).toContain("morphEntry && showComposer");
    expect(source).toContain("data-md-live-working-pill");
    expect(source).toContain("mdLiveShowWorkingPill");
    expect(source).toContain("mdLiveIdleWorkedMs");
    expect(source).toContain("AgentActivityStatusText");
    expect(source).toContain("ActivityIndicator");
    expect(source).toContain("formatWorkDuration");
    expect(source).toContain('chatPanelT("workedFor"');
    expect(source).toContain("AgentChatEdgeFades");
    expect(source).toContain("rootRef={session.transcriptRef}");
    expect(source).toContain("expandThread");
    expect(source).not.toContain("working && !popover");
    expect(source).not.toContain("Sparkles");
    expect(source).not.toContain("data-md-live-source-badge");
    expect(source).not.toContain('t("agentBadge")');
    expect(source).not.toContain("isLiveSource");
    expect(source).not.toContain("border-b border-border");
    expect(source).not.toContain('data-md-live-expand=""');
    expect(source).not.toContain("Maximize2");
    expect(source).toContain("setExpanded(true)");
    expect(source).toContain("setExpanded(false)");
    expect(source).toContain("data-md-live-accept");
    expect(source).toContain("data-md-live-reject");
    expect(source).toContain("data-md-live-pin");
    expect(source).toContain("data-md-live-new-session");
    expect(source).toContain("minimizeToBar");
    expect(source).toContain("isMdLiveAgentOverlayDismissTarget");
    expect(source).toContain("if (pinned) return");
    expect(source).toContain("prependMdLiveComposerContext");
    expect(source).toContain("onDraftChange");
    expect(source).toContain("mdLiveSelectionPopoverStyle");
    expect(source).toContain("nextMdLiveBarMode");
    expect(source).toContain("MD_LIVE_AGENT_PANEL_CLASS");
    expect(source).toContain("MD_LIVE_AGENT_STACK_CLASS");
    expect(source).toContain("MD_LIVE_AGENT_THREAD_MAX_CLASS");
    expect(source).toContain("z-[60]");
    expect(source).toContain('import "../md-live-agent-overlay.css"');
    expect(source).toContain('promptClassName="bg-popover"');
    expect(source).toContain('data-md-live-agent-thread-card=""');
    expect(source).toContain("mdLiveShowThreadCard");
    expect(source).toContain('data-md-live-minimize=""');
    expect(source).not.toContain("min-h-[12rem]");
    expect(source).not.toContain("min-h-[min(48vh,20rem)]");
    expect(source).not.toContain('backgroundColor: "var(--popover)"');
    expect(source).toContain('setPlacement("bottom")');
    expect(source).toContain("setExpanded(false)");
    expect(source).toContain("AgentChatTranscriptList");
    const helpers = readFileSync(join(import.meta.dir, "../md-live-agent-chat.ts"), "utf8");
    expect(helpers).toContain("bg-popover");
    expect(helpers).toContain("MD_LIVE_AGENT_PANEL_CLASS");
    expect(helpers).toContain("MD_LIVE_AGENT_STACK_CLASS");
    expect(helpers).toContain("mdLiveShowThreadCard");
    expect(helpers).toContain("mdLiveBarSurface");
    expect(helpers).toContain("mdLiveInviteMorphs");
    expect(helpers).toContain("MD_LIVE_INVITE_LAYOUT_ID");
    expect(helpers).toContain("MD_LIVE_INVITE_HAIRLINE_WIDTH_PX = 140");
    expect(helpers).toContain("MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX = 2");
    expect(helpers).toContain('"invite"');
    expect(helpers).toContain("mdLiveShowWorkingPill");
    expect(helpers).toContain("mdLiveIdleWorkedMs");
    expect(helpers).toContain('MD_LIVE_AGENT_CHAT_SOURCE = "md-live"');
    expect(helpers).toContain("isMdLiveAgentOverlayDismissTarget");
    expect(helpers).toContain("mdLiveAgentChromeStep");
    expect(helpers).toContain("MD_LIVE_AGENT_CHROME_MAX_THREAD_PX = 576");
    expect(helpers).toContain("MD_LIVE_AGENT_CHROME_MAX_MODEL_TEXT_PX = 448");
    expect(helpers).toContain("MD_LIVE_AGENT_CHROME_MAX_MODE_LABEL_PX = 352");
    expect(helpers).toContain("MD_LIVE_AGENT_CHROME_MAX_PERMISSION_LABEL_PX = 288");
    const overlayCss = readFileSync(
      join(import.meta.dir, "../../md-live-agent-overlay.css"),
      "utf8",
    );
    expect(overlayCss).toContain("container-name: md-live-agent");
    expect(overlayCss).toContain("[data-md-live-agent-thread-card]");
    expect(overlayCss).toContain("[data-md-live-working-pill]");
    expect(overlayCss).toContain("[data-md-live-message-agent]");
    expect(overlayCss).toContain("[data-md-live-invite-hairline]");
    expect(overlayCss).toContain("width: 140px");
    expect(overlayCss).toContain("var(--foreground) 34%");
    expect(overlayCss).not.toMatch(/\[data-md-live-invite-hairline\]\s*\{[^}]*\bwidth:\s*100%/);
    expect(overlayCss).toContain("[data-md-live-agent-thread] .agent-chat-edge-fade");
    expect(overlayCss).toContain("background-color: var(--popover) !important");
    expect(overlayCss).not.toMatch(
      /\[data-md-live-agent-popover\],\s*\[data-md-live-agent-bar\]\s*\{[^}]*background-color/,
    );
    expect(overlayCss.indexOf("max-width: 576px")).toBeGreaterThan(0);
    expect(overlayCss.indexOf("max-width: 448px")).toBeGreaterThan(
      overlayCss.indexOf("max-width: 576px"),
    );
    expect(overlayCss.indexOf("max-width: 352px")).toBeGreaterThan(
      overlayCss.indexOf("max-width: 448px"),
    );
    expect(overlayCss.indexOf("max-width: 288px")).toBeGreaterThan(
      overlayCss.indexOf("max-width: 352px"),
    );
    expect(overlayCss).toContain("[data-prompt-thread]");
    expect(overlayCss).toContain("[data-prompt-model-label]");
    expect(overlayCss).toContain("[data-prompt-mode]");
    expect(overlayCss).toContain("[data-prompt-permission]");
    expect(overlayCss).not.toContain("[data-agent-chat]");
    const picker = readFileSync(
      join(import.meta.dir, "../../../agent/components/AgentChatWorkingDirectoryPicker.tsx"),
      "utf8",
    );
    expect(picker).toContain('data-prompt-thread=""');
    expect(source).toContain("MD_LIVE_HIDE_SELECTION_TOOLBAR_EVENT");
    expect(source).toContain("mdLiveOverlayTitle");
    expect(source).toContain("data-md-live-agent-header");
    expect(source).toContain("data-md-live-agent-chrome");
    expect(source).toContain("hasComposerChrome ? (");
    expect(source).toContain('mdLiveOverlayTitle(session.displaySessionTitle, "")');
    expect(source).toContain("<Plus");
    expect(source).toContain("<Pin");
    expect(source).not.toContain("compact");
    expect(source).not.toContain('t("chat")');
    expect(source).not.toContain("<X");
    expect(source).not.toContain("bg-background/95");
    expect(source).not.toContain("drop-shadow-lg");
    expect(source).not.toContain("showThread ? MD_LIVE_AGENT_PANEL_CLASS");
    expect(source).not.toContain("insertFileMentionForInstanceKey");
    expect(source).not.toContain("insertAiContextForInstanceKey");
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
