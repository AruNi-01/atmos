import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function readWeb(rel: string) {
  return readFileSync(join(import.meta.dir, rel), "utf8");
}

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc);
      continue;
    }
    if (full.endsWith(".ts") || full.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

describe("Agent Sessions host wiring", () => {
  test("CurrentView and Launchpad open /agent-sessions", () => {
    const params = readWeb("../../shared/hooks/use-context-params.ts");
    expect(params).toContain('| "agent-sessions"');
    expect(params).toContain('firstSegment === "agent-sessions"');

    const items = readWeb("../../features/settings/lib/launchpad-items.ts");
    expect(items).toContain("'agent-sessions'");
    expect(items).toContain("ALWAYS_ON_DEFAULT_IDS");
    expect(items).toMatch(/ALWAYS_ON_DEFAULT_IDS[\s\S]*'agent-sessions'/);

    const launchpad = readWeb("../LeftSidebarLaunchpad.tsx");
    expect(launchpad).toContain('"agent-sessions"');
    expect(launchpad).toContain('path: "/agent-sessions"');
    expect(launchpad).toContain("icon: Layers");
    expect(launchpad).toContain("LayersIcon");
    expect(launchpad).not.toContain("BotMessageSquareIcon");
    expect(launchpad).not.toMatch(/text-transform:\s*uppercase/);

    const settings = readWeb("../../features/settings/components/LaunchpadLayoutSettings.tsx");
    expect(settings).toContain("'agent-sessions': Layers");

    const page = readWeb("../../app/(app)/agent-sessions/page.tsx");
    expect(page).toContain("Agent Sessions");

    const search = readWeb("../global-search-app-items.tsx");
    expect(search).toContain("launchpad-agent-sessions");
    expect(search).toContain('router.push("/agent-sessions")');
  });

  test("LeftSidebar keeps the workspace tree on Agent Sessions", () => {
    const sidebar = readWeb("../LeftSidebar.tsx");
    expect(sidebar).toContain('currentView === \'agent-sessions\'');
    expect(sidebar).not.toContain("HostSessionSidebar");
    expect(sidebar).not.toContain("isAgentSessionsView");
    expect(sidebar).toContain("LeftSidebarLaunchpadBlock");
    expect(sidebar).toContain("{projectTabContent}");
    expect(sidebar).toContain("<LeftSidebarFooter");
  });

  test("center stage mounts HostSessionCenterView for agent-sessions", () => {
    const support = readWeb("../center-stage-support.tsx");
    expect(support).toContain("HostSessionCenterView");
    expect(support).toContain('currentView === "agent-sessions"');
    const center = readWeb("../../features/agent-sessions/components/HostSessionCenterView.tsx");
    expect(center).toContain("HostSessionListView");
    expect(center).toContain("HostSessionDrawer");
    expect(center).not.toContain("PushPageStack");
    expect(center).not.toContain("usePushPageTransition");

    const drawer = readWeb("../../features/agent-sessions/components/HostSessionDrawer.tsx");
    expect(drawer).toContain("DrawerCloseButton");
    expect(drawer).toContain("!select-text");
    expect(drawer).toContain("useTaskDrawerInsets");
    expect(drawer).toContain("0.7");
    expect(drawer).toContain("SHEET_GAP_Y_PX");
    expect(drawer).toContain("SHEET_GAP_RIGHT_PX");
  });

  test("list and transcript virtualize with useVirtualizer", () => {
    const list = readWeb("../../features/agent-sessions/components/HostSessionListView.tsx");
    const transcript = readWeb(
      "../../features/agent-sessions/components/HostSessionTranscript.tsx",
    );
    expect(list).toContain("useVirtualizer");
    expect(transcript).toContain("select-text");
    expect(list).toContain("flattenHostSessionRows");
    expect(list).toContain("groupMode");
    expect(list).toContain('"all"');
    expect(list).not.toContain("LaunchpadPageTabs");
    expect(list).not.toContain("icon: Bot");
    expect(list).toContain("<LayersIcon");
    expect(list).toContain("HostSessionGroupGlyph");
    expect(list).toContain("group/header");
    expect(list).toContain("group-hover/header:opacity-0");
    expect(list).toContain("group-hover/header:opacity-100");
    expect(list).toContain("transition-[opacity,rotate]");
    expect(list).toContain("GROUP_COLLAPSE_MS");
    expect(list).toContain("resizeItem");
    expect(list).not.toContain("hover:bg-muted/40");
    expect(list).not.toContain("group-hover:scale-75");
    expect(list).toContain("HostSessionFilterSortMenu");
    expect(list).toContain("formatHostSessionBytes");
    expect(list).toContain("MessageSquare");
    expect(list).toContain('t("messageCount"');
    expect(list).not.toContain("max-w-[130px] truncate");
    expect(list).toContain("h-11");
    const menu = readWeb("../../features/agent-sessions/components/HostSessionFilterSortMenu.tsx");
    expect(menu).toContain("HostSessionFilterMenu");
    expect(menu).toContain("HostSessionSortMenu");
    expect(menu).toContain("h-11 w-11 sm:h-11 sm:w-11");
    expect(menu).toContain("ArrowUpDown");
    expect(menu).toContain("ListFilter");
    expect(menu).toContain('t("groupBy")');
    expect(menu).toContain('groupMode === "all"');
    expect(menu).toContain('groupMode === "agent"');
    expect(menu).toContain('groupMode === "project"');
    expect(menu).toContain('sort.field === "started_at"');
    expect(menu).toContain('sort.field === "byte_size"');
    expect(menu).toContain("HostSessionDateMenuItem");
    const dateFilter = readWeb("../../features/agent-sessions/components/HostSessionDateRangeFilter.tsx");
    expect(dateFilter).toContain("DateRangePickerPanel");
    expect(dateFilter).toContain("DropdownMenuSubTrigger");
    expect(dateFilter).toContain("onClose");
    expect(dateFilter).toContain("onClose()");
    expect(menu).toContain("onClose={() => setOpen(false)}");
    expect(dateFilter).not.toContain('mode="range"');
    expect(dateFilter).not.toContain("numberOfMonths");
    expect(menu).toContain('sort.order === "desc"');
    expect(menu).toContain("<Check");
    expect(menu).not.toContain("DropdownMenuRadioItem");
    expect(list).toContain("aria-current");
    expect(list).not.toContain("filterHostSessions");
    expect(list).not.toContain("filterHostSessionsByQuery");
    expect(list).toContain("useHostSessionList({ query, filters, sort })");
    expect(list).toContain("loadMore");
    expect(list).toContain("hasMore");
    expect(list).toContain("hostSessionHighlightParts");
    expect(list).toContain("<mark");
    expect(list).toContain("bg-info/35");
    expect(list).toContain("hit.session_key");
    expect(list).toContain("searchStatus");
    expect(list).toContain("searchProgress");
    expect(list).toContain("indexingProgress");
    expect(list).toContain("host-session-index-progress");
    expect(list).toContain("isSyncing");
    const header = list.slice(list.indexOf("sticky top-0"), list.indexOf("searchPlaceholder"));
    expect(header).toContain('aria-label={t("refresh")}');
    expect(header.indexOf("indexingProgress")).toBeLessThan(header.indexOf('aria-label={t("refresh")}'));
    expect(header).not.toContain("LaunchpadPageTabs");
    const hook = readWeb("../../features/agent-sessions/hooks/use-host-session-list.ts");
    expect(hook).toContain("HOST_SESSION_PAGE_SIZE");
    expect(hook).toContain("limit: HOST_SESSION_PAGE_SIZE");
    expect(hook).toContain("offset: 0");
    expect(hook).toContain("offset: loaded");
    expect(hook).toContain("sort_field: sort.field");
    expect(hook).toContain("updated_after: updatedAfter");
    expect(hook).toContain("updated_before: updatedBefore");
    expect(hook).toContain("provider_id: providerId");
    expect(hook).toContain("search_progress");
    expect(hook).toContain('payload.search_status === "ready"');
    expect(list).not.toContain("size-11 shrink-0");
    expect(list).not.toContain("active:scale");
    expect(transcript).toContain("AgentChatTranscriptList");
    expect(transcript).toContain("Conversation");
    expect(transcript).toContain("ConversationContent");
    expect(transcript).toContain('initial={initialScrollIndex == null ? "instant" : false}');
    expect(transcript).toContain("pinToEnd={initialScrollIndex == null}");
    expect(transcript).not.toContain("AgentPromptComposer");
    expect(list).not.toMatch(/text-transform:\s*uppercase/);
    expect(transcript).not.toMatch(/text-transform:\s*uppercase/);

    const detail = readWeb("../../features/agent-sessions/components/HostSessionDetailView.tsx");
    expect(detail).toContain("FindPanel");
    expect(detail).toContain("FindHighlightProvider");
    expect(detail).toContain("useFindPanel");
    expect(detail).toContain("TRANSCRIPT_FIND_SCOPE");
    expect(detail).not.toContain("HostSessionFindPanel");
    expect(detail).not.toContain("findInTranscript");
    expect(detail).toContain("AgentChatAboveComposerOverlays");
    expect(detail).toContain("grokCardsDefaultOpen={false}");
    expect(detail).toContain('subagentCardMode="transcript"');
    expect(detail).toContain("subagentTasks={{ items: [], tools: [] }}");
    expect(detail).not.toContain("currentTurnSubagentTasks");
    expect(detail).toContain("data-agent-chat-column");
    expect(detail).toContain("[container-type:size]");
    expect(detail).toContain("overflow-hidden [container-type:size]");
    expect(detail).toContain("preview?.grok_goal");
    expect(detail).toContain("preview?.grok_workflow");
    expect(detail).toContain("SubagentConversationOverlay");
    expect(detail).toContain("AgentMessageTimelineNav");
    expect(detail).not.toContain("activeAgent={null}");
    expect(detail).toContain("hostSessionAgentIconId(session.provider_id)");
    expect(detail).toContain("hostSessionAgentLabel(session.provider_id)");
    expect(detail).toContain("HostSessionResumeMenu");
    expect(detail).toContain('variant="default"');
    expect(detail).toContain("MessageSquare");
    expect(detail).toContain("SquareTerminal");
    expect(detail).not.toContain("border-b border-border/60 bg-background/80");
    expect(detail).toContain("drawerCloseReserveClass");
    expect(detail).toContain("useDrawerCloseReserve");
    expect(detail).toContain("hostSessionMessageIndex");
    expect(detail).toContain("fillHostSessionTurnTiming");
    expect(detail).toContain("scrollToIndexRef");
    expect(detail).not.toContain("onBack");
    expect(detail).not.toContain("ArrowLeft");
    expect(detail).toContain("hostSessionAgentIconId");
    expect(detail).toContain("<Folder");
    expect(detail).not.toContain("<Bot");
    expect(detail).not.toContain("active:scale");
    expect(detail).not.toContain("max-h-[42%]");
  });

  test("feature files use host_session_* and avoid third-party browser product names", () => {
    const featureDir = join(import.meta.dir, "../../features/agent-sessions");
    const api = readWeb("../../api/ws/host-session-api.ts");
    expect(api).toContain('wsRequest("host_session_list"');
    expect(api).toContain("query:");
    expect(api).toContain("HostSessionSearchHit");
    expect(api).toContain('wsRequest("host_session_get"');
    expect(api).toContain('wsRequest("host_session_resume_chat"');
    expect(api).toContain('wsRequest("host_session_resume_tui"');
    expect(api).not.toContain("<");

    const sources = collectFiles(featureDir)
      .concat([
        join(import.meta.dir, "../../api/ws/host-session-api.ts"),
        join(import.meta.dir, "../../app/(app)/agent-sessions/page.tsx"),
      ])
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(sources).toContain("host_session_list");
    expect(sources).toContain("host_session_get");
    expect(sources).toContain("host_session_resume_chat");
    expect(sources).toContain("host_session_resume_tui");
    expect(sources).not.toMatch(/session-browser/i);
    expect(sources).not.toMatch(/sessionbrowser/i);
    expect(sources).not.toContain("AgentChatSessionsView");
  });

  test("English copy is sentence case Agent Sessions", () => {
    const en = readWeb("../../../messages/en.json");
    const zh = readWeb("../../../messages/zh.json");
    expect(en).toContain('"agentSessions": "Agent Sessions"');
    expect(en).toContain('"resume": "Resume"');
    expect(en).toContain('"resumeChat": "Chat"');
    expect(en).toContain('"resumeTui": "TUI"');
    expect(en).toContain('"atmosChatTag": "Atmos Chat"');
    expect(en).toContain('"resumeTuiNoWorkspace"');
    expect(en).toContain('"searchPlaceholder": "Search titles and messages"');
    expect(en).toContain('"indexing": "Indexing messages"');
    expect(en).toContain('"indexingProgress": "Indexing {percent}%"');
    expect(en).toContain('"trigger": "Filter"');
    expect(en).toContain('"trigger": "Sort"');
    expect(en).toContain('"Created time"');
    expect(en).toContain('"Modified time"');
    expect(en).toContain('"Ascending"');
    expect(en).toContain('"Descending"');
    expect(en).toContain('"groupBy": "Group by"');
    expect(en).toContain('"groupAll": "All"');
    expect(en).toContain('"tabs"');
    expect(en).toContain('"emptyHomesTitle": "No CLI sessions yet"');
    expect(en).toContain('"clearSearch": "Clear search"');
    expect(zh).toContain('"emptyHomesTitle": "还没有命令行会话"');
    expect(zh).toContain('"clearSearch": "清除搜索"');
    expect(zh).toContain('"indexingProgress": "正在索引 {percent}%"');
    expect(zh).toContain('"trigger": "筛选"');
    expect(zh).toContain('"trigger": "排序"');
    expect(zh).toContain('"创建时间"');
    expect(zh).toContain('"修改时间"');
    expect(zh).toContain('"升序"');
    expect(zh).toContain('"倒序"');
    expect(zh).toContain('"groupBy": "分组"');
    expect(zh).toContain('"groupAll": "全部"');
    expect(en).not.toContain('"resumeChat": "RESUME IN CHAT"');
    expect(zh).toContain('"agentSessions": "智能体会话"');
    expect(zh).toContain('"resume": "继续"');
    expect(zh).toContain('"resumeChat": "Chat"');
    expect(zh).toContain('"resumeTui": "TUI"');
    expect(zh).toContain("没有匹配的工作区");
    expect(zh).not.toContain('"agentSessions": "Agent Sessions"');
  });

  test("Resume in TUI queues a mosaic launch at the session cwd", () => {
    const resume = readWeb("../../features/agent-sessions/lib/host-session-resume.ts");
    expect(resume).toContain("queueAgentRun");
    expect(resume).toContain("reuseIdlePane: false");
    expect(resume).toContain("formatHostSessionTuiLaunch");
    expect(resume).toContain("ensureWorkspaceVisible");
    expect(resume).toContain("commitLocatedPaneNavigation");
    expect(resume).toContain('grok: "grok-build"');

    const command = readWeb("../../features/agent-sessions/lib/host-session-command.ts");
    expect(command).toContain("matchHostSessionCwd");
    expect(command).toContain("cd ${shellSingleQuote(cwd)} && ${command}");

    const detail = readWeb("../../features/agent-sessions/components/HostSessionDetailView.tsx");
    expect(detail).toContain("resumeHostSessionInTui(");
    expect(detail).toContain("router,");
    expect(detail).toContain("projects,");
    expect(detail).toContain("resumeTuiNoWorkspace");

    const stage = readWeb("../CenterStage.tsx");
    expect(stage).toContain("reuseIdlePane: pending.reuseIdlePane");

    const store = readWeb("../../features/workspace/store/workspace-creation-store.ts");
    expect(store).toContain("reuseIdlePane?: boolean");
  });
});
