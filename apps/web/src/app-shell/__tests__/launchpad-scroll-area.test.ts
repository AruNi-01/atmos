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
