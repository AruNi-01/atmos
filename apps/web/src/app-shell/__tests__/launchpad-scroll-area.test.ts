import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

function count(source: string, snippet: string) {
  return source.split(snippet).length - 1;
}

function expectFadedScrollArea(source: string, minCount = 1) {
  expect(source).toContain("<ScrollArea");
  expect(count(source, "scrollFade")).toBeGreaterThanOrEqual(minCount);
}

describe("scroll area fade skips stuck sticky chrome", () => {
  it("offsets the viewport mask below measured sticky descendants", () => {
    const fade = read("../../../../../packages/ui/src/components/ui/scroll-area-fade.ts");
    const scrollArea = read("../../../../../packages/ui/src/components/ui/scroll-area.tsx");
    const styles = read("../../../../../packages/ui/src/styles/globals.css");
    expect(fade).toContain("measureStickyFadeInsets");
    expect(fade).toContain("applyStickyFadeInsets");
    expect(scrollArea).toContain("applyStickyFadeInsets");
    expect(scrollArea).toContain("viewportProps");
    expect(scrollArea).toContain('data-scroll-fade={scrollFade ? "" : undefined}');
    expect(styles).toContain("--fade-inset-top");
    expect(styles).toContain("var(--fade-inset-top) + var(--fade-top)");
  });

  it("hides native viewport thumbs and keeps custom bars overflow+hover only", () => {
    const scrollArea = read("../../../../../packages/ui/src/components/ui/scroll-area.tsx");
    const styles = read("../../../../../packages/ui/src/styles/globals.css");
    expect(styles).toContain('[data-slot="scroll-area-viewport"]');
    expect(styles).toContain("scrollbar-width: none");
    expect(styles).toContain("[data-slot=\"scroll-area-viewport\"]::-webkit-scrollbar");
    expect(styles).toContain("display: none");
    expect(scrollArea).toContain("flex size-full min-h-0 flex-col");
    expect(scrollArea).toContain("relative mx-1 mb-1 mt-0.5 h-1.5 w-auto flex-col data-[has-overflow-x]:flex");
    expect(scrollArea).toContain("position: \"relative\"");
    expect(scrollArea).toContain("opacity-0");
    expect(scrollArea).toContain("data-hovering:opacity-100");
    expect(scrollArea).toContain("data-scrolling:opacity-100");
    expect(scrollArea).toContain("hidden");
    expect(scrollArea).not.toContain("data-[orientation=horizontal]:hidden");
  });
});

describe("launchpad feature list scroll areas", () => {
  it("fades the Tasks kanban board (horizontal) and column lists (vertical)", () => {
    const source = read("../sidebar/WorkspaceKanbanView.tsx");
    expectFadedScrollArea(source, 2);
    expect(count(source, "<ScrollArea")).toBe(2);
    expect(source).not.toContain("overflow-x-scroll");
    expect(source).not.toContain("overflow-y-auto");
    expect(source).not.toContain("scrollbar-on-hover");
  });

  it("fades Workspaces recent and archived lists", () => {
    const recent = read("../../features/workspace/components/RecentWorkspacesView.tsx");
    const archived = read("../../features/workspace/components/ArchivedWorkspacesView.tsx");
    expectFadedScrollArea(recent);
    expectFadedScrollArea(archived);
    expect(recent).not.toContain("scrollbar-on-hover");
    expect(archived).not.toContain("scrollbar-on-hover");
  });

  it("fades Skills catalog, files tree, and modal lists", () => {
    const view = read("../../features/skills/components/SkillsView.tsx");
    const detail = read("../../features/skills/components/SkillDetail.tsx");
    const modal = read("../../features/skills/components/SkillsModal.tsx");
    expectFadedScrollArea(view);
    expect(view).not.toContain("overflow-auto");
    expectFadedScrollArea(detail, 2);
    expectFadedScrollArea(modal);
  });

  it("fades Terminals, Agents, and Automations lists", () => {
    const terminals = read("../../features/terminal/components/TerminalManagerView.tsx");
    const agents = read("../../features/agent/components/AgentManagerView.tsx");
    const sessions = read("../../features/agent/components/AgentChatSessionsView.tsx");
    const automations = read("../../features/automations/components/AutomationListPanel.tsx");
    const history = read("../../features/automations/components/RunHistoryPanel.tsx");
    const picker = read("../../features/automations/components/AutomationAgentPicker.tsx");
    expectFadedScrollArea(terminals);
    expect(terminals).not.toContain("scrollbar-on-hover");
    expectFadedScrollArea(agents);
    expect(agents).not.toContain("overflow-auto");
    expectFadedScrollArea(sessions, 2);
    expect(sessions).not.toContain("overflow-y-auto");
    expectFadedScrollArea(automations);
    expect(automations).not.toContain("scrollbar-on-hover");
    expectFadedScrollArea(history);
    expect(history).not.toContain("overflow-auto");
    expectFadedScrollArea(picker);
    expect(picker).not.toContain("overflow-auto");
  });

  it("fades Disk Analyzer, Token Usage, and Tasks source tables", () => {
    const disk = read("../../features/disk-analyzer/components/DiskAnalyzerPage.tsx");
    const suggest = read("../../features/disk-analyzer/components/DiskAnalyzerSuggestPanel.tsx");
    const token = read("../TokenUsagePage.tsx");
    const github = read("../../features/task/components/TaskGithubTable.tsx");
    const linear = read("../../features/task/components/TaskLinearTable.tsx");
    expectFadedScrollArea(disk);
    expectFadedScrollArea(suggest);
    expectFadedScrollArea(token);
    expect(token).not.toContain("overflow-y-auto");
    expectFadedScrollArea(github);
    expect(github).not.toContain("overflow-y-auto");
    expectFadedScrollArea(linear);
    expect(linear).not.toContain("overflow-y-auto");
  });
});

describe("center Files, Changes, and Graph Commit scroll areas", () => {
  it("fades the Files sidecar tree, not the CodeMirror editor", () => {
    const panel = read("../../features/files/components/FileTreePanel.tsx");
    const editor = read("../../features/editor/components/CodeMirrorEditor.tsx");
    expectFadedScrollArea(panel);
    expect(panel).toContain('data-file-tree-scroll=""');
    expect(panel).not.toContain("overflow-y-auto");
    expect(panel).not.toContain("no-scrollbar");
    expect(editor).not.toContain("scrollFade");
  });

  it("fades the Changes sidecar diff file list", () => {
    const source = read("../../features/git/components/ChangesPanel.tsx");
    expectFadedScrollArea(source);
    expect(source).not.toContain("overflow-y-auto");
    expect(source).not.toContain("no-scrollbar");
  });

  it("fades the middle Diff CodeView list and the single-file virtualizer", () => {
    const changesView = read("../../features/diff/components/ChangesCodeView.tsx");
    const viewer = read("../../features/diff/components/DiffViewer.tsx");
    const constants = read("../../features/diff/lib/diff-view-constants.ts");
    const fadeHook = read("../../features/diff/lib/use-scroll-fade-element.ts");
    expect(changesView).toContain("useScrollFadeRef");
    expect(changesView).toContain("CODE_VIEW_HOST_CLASS");
    expect(constants).toContain("diff-code-view-host");
    expect(viewer).toContain("attachScrollFade");
    expect(viewer).toContain("DIFF_VIRTUALIZER_SCROLL_CLASS");
    expect(fadeHook).toContain("attachScrollFade");
    expect(fadeHook).toContain("--scroll-area-overflow-y-start");
  });

  it("fades the Graph Commit list on both axes and keeps virtualization on the viewport", () => {
    const source = read("../../features/git/components/GitHistoryPanel.tsx");
    expectFadedScrollArea(source);
    expect(source).toContain("viewportRef={scrollRef}");
    expect(source).toContain('className="min-h-0 min-w-0 flex-1"');
    expect(source).not.toContain("overflow-auto");
  });
});

describe("GitHub PR, Issue, and Actions scroll areas", () => {
  it("fades the hub PR, Issue, and Actions lists without nested outer scrollers", () => {
    const hub = read("../../features/github/components/GithubHubPanel.tsx");
    const prs = read("../../features/github/components/PRPanel.tsx");
    const issues = read("../../features/github/components/IssuePanel.tsx");
    const actions = read("../../features/github/components/ActionsPanel.tsx");
    const commits = read("../../features/github/components/CommitsPanel.tsx");
    expect(hub).not.toContain("overflow-y-auto");
    expectFadedScrollArea(prs);
    expect(prs).not.toContain("overflow-y-auto");
    expectFadedScrollArea(issues);
    expect(issues).not.toContain("overflow-y-auto");
    expectFadedScrollArea(actions);
    expect(actions).not.toContain("overflow-y-auto");
    expectFadedScrollArea(commits);
    expect(commits).not.toContain("overflow-y-auto");
  });

  it("fades every PR detail tab scroller and sticks only the tabs", () => {
    const detail = read("../../features/github/components/PRDetailView.tsx");
    const sidebar = read("../../features/github/lib/pr-detail-sidebar.tsx");
    const files = read("../../features/github/components/PRFilesTab.tsx");
    expectFadedScrollArea(detail, 2);
    expect(detail).toContain("viewportRef={mainScrollRef}");
    expect(detail).toContain("sticky top-0 z-20 border-t border-border/40 bg-background pb-3 pt-3");
    expect(detail).not.toContain("will-change-transform");
    expect(detail).not.toContain("handleMainScroll");
    expect(detail).not.toContain("prContextRef");
    expect(detail).toContain("activeMainTab !== 'description'");
    expect(detail).toContain("activeMainTab !== 'checks'");
    expect(detail).toContain("activeMainTab !== 'discussion'");
    expect(detail).toContain("activeMainTab !== 'commits'");
    expect(detail).toContain("activeMainTab !== 'files'");
    expect(detail).not.toContain("overflow-y-auto");
    expectFadedScrollArea(sidebar);
    expect(sidebar).not.toContain("overflow-y-auto");
    expect(files).toContain("useScrollFadeRef");
  });

  it("fades Issue description and discussion plus the metadata sidebar", () => {
    const detail = read("../../features/github/components/IssueDetailView.tsx");
    expectFadedScrollArea(detail, 2);
    expect(detail).toContain("sticky top-0 z-20 border-t border-border/40 bg-background pb-3 pt-3");
    expect(count(detail, "sticky top-0")).toBe(1);
    expect(detail).toContain('activeTab !== "description"');
    expect(detail).toContain('activeTab !== "discussion"');
    expect(detail).not.toContain("overflow-y-auto");
  });

  it("fades commit detail and Actions summary, not the workflow CodeMirror pane", () => {
    const commit = read("../../features/github/components/CommitDetailView.tsx");
    const actions = read("../../features/github/components/ActionsDetailView.tsx");
    const jobs = read("../../features/github/components/ActionsJobsList.tsx");
    const create = read("../../features/github/components/PRCreateModal.tsx");
    expectFadedScrollArea(commit);
    expect(commit).toContain("viewportRef={mainScrollRef}");
    expect(commit).toContain("sticky top-0 z-10 min-h-[520px]");
    expect(commit).not.toContain("will-change-transform");
    expect(commit).not.toContain("prContextRef");
    expect(commit).not.toContain("overflow-y-auto");
    expectFadedScrollArea(actions);
    expect(actions).toContain("viewportRef={scrollRef}");
    expect(actions).toContain("sticky top-0 z-20 border-t border-border/40 bg-background pb-3 pt-3");
    expect(actions).not.toContain("will-change-transform");
    expect(actions).toContain('activeTab === "summary"');
    expect(actions).not.toContain("overflow-y-auto");
    expect(count(actions, "scrollFade")).toBe(1);
    expectFadedScrollArea(jobs);
    expect(jobs).toContain('data-actions-nested-scroll=""');
    expect(jobs).not.toContain("overflow-auto");
    expectFadedScrollArea(create, 2);
    expect(create).not.toContain("overflow-y-auto");
  });
});
