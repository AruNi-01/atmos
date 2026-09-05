import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const changeSection = readFileSync(
  join(import.meta.dir, "../sidebar/ChangeSection.tsx"),
  "utf8",
);
const changesPanel = readFileSync(
  join(import.meta.dir, "../../features/git/components/ChangesPanel.tsx"),
  "utf8",
);
const fileTree = readFileSync(
  join(import.meta.dir, "../../features/files/components/FileTree.tsx"),
  "utf8",
);
const fileTreeRow = readFileSync(
  join(import.meta.dir, "../../features/files/components/FileTreeRow.tsx"),
  "utf8",
);
const diffFileTree = readFileSync(
  join(import.meta.dir, "../../features/diff/components/DiffFileTree.tsx"),
  "utf8",
);
const frozenFileList = readFileSync(
  join(import.meta.dir, "../../features/diff/components/review/FrozenFileList.tsx"),
  "utf8",
);
const prPanel = readFileSync(
  join(import.meta.dir, "../../features/github/components/PRPanel.tsx"),
  "utf8",
);
const issuePanel = readFileSync(
  join(import.meta.dir, "../../features/github/components/IssuePanel.tsx"),
  "utf8",
);
const actionsPanel = readFileSync(
  join(import.meta.dir, "../../features/github/components/ActionsPanel.tsx"),
  "utf8",
);
const gitHistoryRow = readFileSync(
  join(import.meta.dir, "../../features/git/components/git-history-row.tsx"),
  "utf8",
);
const centerExplorerLanding = readFileSync(
  join(import.meta.dir, "../CenterExplorerLanding.tsx"),
  "utf8",
);
const centerPaneEmptyState = readFileSync(
  join(import.meta.dir, "../center-pane/CenterPaneEmptyState.tsx"),
  "utf8",
);

describe("center list hover", () => {
  it("uses instant hover on files and changes explorer empty-state rows", () => {
    expect(centerExplorerLanding).toContain("hover:bg-sidebar-accent/50");
    expect(centerExplorerLanding).not.toContain("transition-colors");
    expect(centerExplorerLanding).not.toContain("duration-200");
  });

  it("uses instant hover on split-pane empty launcher rows", () => {
    const rowClass = centerPaneEmptyState.slice(
      centerPaneEmptyState.indexOf("function EmptyPaneTypeButton"),
      centerPaneEmptyState.indexOf("onClick={action.onSelect}"),
    );
    expect(rowClass).toContain("hover:bg-accent");
    expect(rowClass).not.toContain("transition-colors");
    expect(rowClass).not.toContain("transition-all");
    expect(rowClass).not.toContain("duration-");
  });

  it("does not overlay bulk stage/discard on hideHeader file rows", () => {
    expect(changeSection).not.toContain("group/headerless");
    expect(changeSection).not.toContain('renderSectionActions("headerless")');
    expect(changeSection).toContain("onStage([file.path])");
    expect(changeSection).toContain("onDiscard?.([file.path])");

    const changeSectionUsages = [
      ...changesPanel.matchAll(/<ChangeSection[\s\S]*?\/>/g),
    ].map((match) => match[0]);
    expect(changeSectionUsages.length).toBeGreaterThan(0);
    for (const usage of changeSectionUsages) {
      expect(usage).not.toContain("onStageAll");
      expect(usage).not.toContain("onUnstageAll");
      expect(usage).not.toContain("onDiscardAll");
    }
  });

  it("uses instant hover on changes file rows, not a delayed color fade", () => {
    const rowClass = changeSection.slice(
      changeSection.indexOf("group flex items-center px-2 py-1.5"),
      changeSection.indexOf("<DiffFilePathLabel"),
    );
    expect(rowClass).toContain("hover:bg-sidebar-accent/50");
    expect(rowClass).not.toContain("transition-colors");
    expect(rowClass).not.toContain("duration-200");
    expect(rowClass).not.toContain("ease-out");
  });

  it("uses instant hover on empty-state change-scope recommendations", () => {
    const rowClass = changesPanel.slice(
      changesPanel.indexOf("group flex w-full items-center gap-2 rounded-sm px-2 py-2"),
      changesPanel.indexOf("ScopeIcon className="),
    );
    expect(rowClass).toContain("hover:bg-sidebar-accent/50");
    expect(rowClass).not.toContain("transition-colors");
    expect(rowClass).not.toContain("duration-200");
  });

  it("uses instant hover on files tree rows", () => {
    const rowClass = fileTreeRow.slice(
      fileTreeRow.indexOf("flex items-center py-1 px-2 cursor-pointer"),
      fileTreeRow.indexOf("isHighlighted && !isActive"),
    );
    expect(rowClass).toContain("hover:bg-sidebar-accent/50");
    expect(rowClass).not.toContain("transition-colors");
  });

  it("insets files tree hover and active backgrounds from the sidecar edges", () => {
    expect(fileTree).toContain('className="relative px-1.5"');
    expect(fileTreeRow).toContain("data-file-tree-row={itemData.path}");
  });

  it("uses instant hover on changes tree rows", () => {
    const rowClass = diffFileTree.slice(
      diffFileTree.indexOf("group/file relative flex h-7"),
      diffFileTree.indexOf("file ? \"cursor-pointer\""),
    );
    expect(rowClass).not.toContain("transition-colors");
  });

  it("uses instant hover on review diff file rows", () => {
    const rowClass = frozenFileList.slice(
      frozenFileList.indexOf("group flex items-center gap-2 rounded-md px-2 py-1.5"),
      frozenFileList.indexOf("isCurrent && \"bg-sidebar-accent\""),
    );
    expect(rowClass).toContain("hover:bg-sidebar-accent");
    expect(rowClass).not.toContain("transition-colors");
  });

  it("uses instant hover on graph history commit rows", () => {
    const rowClass = gitHistoryRow.slice(
      gitHistoryRow.indexOf("grid h-9 cursor-pointer items-center"),
      gitHistoryRow.indexOf("matched && !selected"),
    );
    expect(rowClass).toContain("hover:bg-muted/40");
    expect(rowClass).not.toContain("transition-colors");
  });

  it("uses instant hover on GitHub PR, issue, and action cards", () => {
    const prCard = prPanel.slice(
      prPanel.indexOf("flex flex-col p-3 rounded-md border border-sidebar-border"),
      prPanel.indexOf("{/* Top Row: Title & State */}"),
    );
    expect(prCard).toContain("hover:bg-sidebar-accent/50");
    expect(prCard).not.toContain("transition-all");
    expect(prCard).not.toContain("transition-colors");

    const issueCard = issuePanel.slice(
      issuePanel.indexOf("group flex w-full min-w-0 cursor-pointer flex-col gap-2"),
      issuePanel.indexOf("flex min-w-0 items-baseline gap-1.5"),
    );
    expect(issueCard).toContain("hover:bg-sidebar-accent/50");
    expect(issueCard).not.toContain("transition-colors");

    const actionsCard = actionsPanel.slice(
      actionsPanel.indexOf("flex flex-col p-3 rounded-md border border-sidebar-border"),
      actionsPanel.indexOf("flex items-start justify-between gap-2"),
    );
    expect(actionsCard).toContain("hover:bg-sidebar-accent/50");
    expect(actionsCard).not.toContain("transition-colors");
  });
});
