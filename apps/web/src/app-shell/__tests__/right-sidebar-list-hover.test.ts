import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const changeSection = readFileSync(
  join(import.meta.dir, "../sidebar/ChangeSection.tsx"),
  "utf8",
);
const rightSidebar = readFileSync(
  join(import.meta.dir, "../RightSidebar.tsx"),
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
const gitHistoryPanel = readFileSync(
  join(import.meta.dir, "../../features/git/components/GitHistoryPanel.tsx"),
  "utf8",
);

describe("right sidebar list hover", () => {
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
    const rowClass = rightSidebar.slice(
      rightSidebar.indexOf("group flex w-full items-center gap-2 rounded-sm px-2 py-2"),
      rightSidebar.indexOf("ScopeIcon className="),
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
    const rowClass = gitHistoryPanel.slice(
      gitHistoryPanel.indexOf("grid h-9 cursor-pointer items-center"),
      gitHistoryPanel.indexOf("matched && !selected"),
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
